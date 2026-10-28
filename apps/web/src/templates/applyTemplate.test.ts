import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api, type FetchFn } from '../api/client.ts'
import { startTestServer, type TestServer } from '../test/server.ts'
import { applyTemplate } from './applyTemplate.ts'

const V1 = '## Objectives\n\n| Squat | [ ] |'
const V2 = '## Goals\n\n| Squat | [ ] |'

describe('applyTemplate', () => {
  let server: TestServer
  let api: Api

  beforeEach(async () => {
    server = await startTestServer()
    await server.signup()
    api = new Api(server.fetch)
  })

  afterEach(async () => {
    await server.close()
  })

  /** An Api whose first page save is preceded by `meanwhile`, like another device saving. */
  function racingApi(meanwhile: () => Promise<unknown>): Api {
    let raced = false
    const fetchFn: FetchFn = async (input, init) => {
      if (!raced && init?.method === 'PUT' && input.startsWith('/api/notes/')) {
        raced = true
        await meanwhile()
      }
      return server.fetch(input, init)
    }
    return new Api(fetchFn)
  }

  it('keeps edits saved meanwhile on other lines of a page', async () => {
    await api.saveTemplate('week', V1, 0)
    await api.saveNote('week', '2026-10-26', V1, 0, { templateRevision: 1 })
    await api.saveTemplate('week', V2, 1)

    const applied = await applyTemplate(
      racingApi(() => api.saveNote('week', '2026-10-26', V1.replace('[ ]', '[x]'), 1)),
      'week',
      '2026-10-26',
      { revision: 2, content: V2 },
    )

    expect(applied).toEqual({ updated: 1, conflicts: [] })
    expect(await api.getNote('week', '2026-10-26')).toMatchObject({
      content: V2.replace('[ ]', '[x]'),
      templateRevision: 2,
    })
  })

  it('reports a page changed meanwhile on the same lines, against its latest revision', async () => {
    await api.saveTemplate('week', V1, 0)
    await api.saveNote('week', '2026-10-26', V1, 0, { templateRevision: 1 })
    await api.saveTemplate('week', V2, 1)

    const applied = await applyTemplate(
      racingApi(() =>
        api.saveNote('week', '2026-10-26', V1.replace('## Objectives', '## Plans'), 1),
      ),
      'week',
      '2026-10-26',
      { revision: 2, content: V2 },
    )

    expect(applied.updated).toBe(0)
    expect(applied.conflicts).toEqual([
      {
        key: '2026-10-26',
        revision: 2,
        base: V1,
        chunks: [
          { type: 'conflict', base: ['## Objectives'], mine: ['## Plans'], theirs: ['## Goals'] },
          { type: 'ok', lines: ['', '| Squat | [ ] |'] },
        ],
      },
    ])
    expect(await api.getNote('week', '2026-10-26')).toMatchObject({
      content: V1.replace('## Objectives', '## Plans'),
      templateRevision: 1,
    })
  })
})
