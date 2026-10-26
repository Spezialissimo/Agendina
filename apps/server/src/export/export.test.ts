import type { DatabaseHandle } from '@agendina/db'
import { testDatabases } from '@agendina/db/testing'
import { unzipSync, strFromU8 } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestServer } from '../testing.ts'

describe.each(testDatabases())('export on $kind', ({ create }) => {
  let handle: DatabaseHandle
  let server: ReturnType<typeof createTestServer>
  let cookie: string

  beforeEach(async () => {
    handle = await create()
    server = createTestServer(handle, { now: () => new Date('2026-10-26T10:00:00.000Z') })
    cookie = await server.signup()
  })

  afterEach(async () => {
    await handle.close()
  })

  const save = async (kind: string, key: string, content: string, as = cookie) => {
    const res = await server.request(`/api/notes/${kind}/${key}`, {
      method: 'PUT',
      cookie: as,
      body: { content, baseRevision: 0 },
    })
    expect(res.status).toBe(200)
  }
  const exportZip = async (as = cookie) => {
    const res = await server.request('/api/export', { cookie: as })
    expect(res.status).toBe(200)
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
    return {
      res,
      files: Object.fromEntries(
        Object.entries(files).map(([name, data]) => [name, strFromU8(data)]),
      ),
    }
  }

  it('downloads a dated zip file', async () => {
    const { res } = await exportZip()

    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="agendina-export-2026-10-26.zip"',
    )
  })

  it('contains every day and week page as markdown, exactly as written', async () => {
    const day = '- [x] Città 🏋️\r\ntrailing   \n'
    const week = '| Squat | [x] | [ ] |\n'
    await save('day', '2026-10-26', day)
    await save('week', '2026-10-19', week)

    const { files } = await exportZip()

    expect(files).toEqual({ 'days/2026-10-26.md': day, 'weeks/2026-10-19.md': week })
  })

  it('leaves out deleted pages', async () => {
    await save('day', '2026-10-25', 'kept')
    await save('day', '2026-10-26', 'deleted')
    await server.request('/api/notes/day/2026-10-26?baseRevision=1', { method: 'DELETE', cookie })

    const { files } = await exportZip()

    expect(Object.keys(files)).toEqual(['days/2026-10-25.md'])
  })

  it('contains only the signed-in user’s pages', async () => {
    await server.request('/api/admin/settings', {
      method: 'PUT',
      cookie,
      body: { signupOpen: true },
    })
    const other = await server.signup('other@example.com')
    await save('day', '2026-10-26', 'mine')

    expect((await exportZip(other)).files).toEqual({})
  })

  it('requires a signed-in user', async () => {
    expect((await server.request('/api/export')).status).toBe(401)
  })
})
