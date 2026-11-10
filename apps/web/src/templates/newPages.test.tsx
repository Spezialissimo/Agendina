import type { Layout } from '@agendina/core'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { editorText, replaceText, typeInto } from '../test/editor.ts'
import { renderApp } from '../test/render.tsx'
import { settingsWithLayout } from '../test/settings.ts'
import { startTestServer, type TestServer } from '../test/server.ts'

const TODAY = 'Monday, October 26, 2026'
const WEEK_TEMPLATE =
  '## Objectives\n\n| Exercise | Mo | We |\n|---|---|---|\n| Squat | [ ] | [ ] |'

describe('new pages start from the template', () => {
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

  const editor = (name: string) => screen.findByRole('textbox', { name })
  const status = (name: string) => within(screen.getByRole('region', { name })).getByRole('status')

  it('shows the template on a page nobody wrote yet, without saving it', async () => {
    await api.saveTemplate('week', WEEK_TEMPLATE, 0)
    renderApp(server, '/day/2026-10-26')

    expect(editorText(await editor('Week 44'))).toBe(WEEK_TEMPLATE)
    expect(status('Week 44')).toHaveTextContent('Saved')
    expect(await api.getNote('week', '2026-10-26')).toBeNull()
  })

  it('saves the page with its template revision once you write on it', async () => {
    await api.saveTemplate('week', 'v1', 0)
    await api.saveTemplate('week', WEEK_TEMPLATE, 1)
    renderApp(server, '/day/2026-10-26')

    typeInto(await editor('Week 44'), '\n- [ ] Book physio')

    await waitFor(async () => {
      expect(await api.getNote('week', '2026-10-26')).toMatchObject({
        content: `${WEEK_TEMPLATE}\n- [ ] Book physio`,
        templateRevision: 2,
      })
    })
  })

  it('uses the day template for day pages', async () => {
    await api.saveTemplate('day', '## Today\n\n', 0)
    await api.saveTemplate('week', WEEK_TEMPLATE, 0)
    renderApp(server, '/day/2026-10-26')

    expect(editorText(await editor(TODAY))).toBe('## Today\n\n')
  })

  it('leaves pages already written as they are', async () => {
    await api.saveTemplate('day', '## Today', 0)
    await api.saveNote('day', '2026-10-26', 'my own page', 0)
    renderApp(server, '/day/2026-10-26')

    expect(editorText(await editor(TODAY))).toBe('my own page')
  })

  it('keeps an emptied page empty instead of bringing the template back', async () => {
    await api.saveTemplate('day', '## Today', 0)
    await api.saveNote('day', '2026-10-26', '', 0, { templateRevision: 1 })
    renderApp(server, '/day/2026-10-26')

    expect(editorText(await editor(TODAY))).toBe('')
  })

  it('merges two devices starting the same new page from the template', async () => {
    await api.saveTemplate('day', '## Morning\n\n## Evening', 0)
    renderApp(server, '/day/2026-10-26')
    const textbox = await editor(TODAY)
    // The phone wrote under "Evening" meanwhile.
    await api.saveNote('day', '2026-10-26', '## Morning\n\n## Evening\nRead', 0, {
      templateRevision: 1,
    })

    replaceText(textbox, '## Morning\nRan 5km\n\n## Evening')

    await waitFor(async () => {
      expect((await api.getNote('day', '2026-10-26'))?.content).toBe(
        '## Morning\nRan 5km\n\n## Evening\nRead',
      )
    })
    expect(editorText(textbox)).toBe('## Morning\nRan 5km\n\n## Evening\nRead')
  })

  it('shows the template on read-only neighbour pages too', async () => {
    const layout: Layout = {
      type: 'split',
      id: 'pages',
      direction: 'row',
      children: [
        {
          size: 1,
          node: {
            type: 'panel',
            id: 'yesterday',
            panel: { type: 'note', kind: 'day', offset: -1 },
          },
        },
        {
          size: 2,
          node: { type: 'panel', id: 'today', panel: { type: 'note', kind: 'day', offset: 0 } },
        },
      ],
    }
    await api.saveSettings(settingsWithLayout(layout))
    await api.saveTemplate('day', '## Today', 0)
    renderApp(server, '/day/2026-10-26')

    const yesterday = await screen.findByRole('region', { name: 'Sunday, October 25, 2026' })

    expect(await within(yesterday).findByText('## Today')).toBeInTheDocument()
  })
})
