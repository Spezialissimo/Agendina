import { focusManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { renderApp } from '../test/render.tsx'
import { startTestServer, type TestServer } from '../test/server.ts'

const TODAY = 'Monday, 26 October 2026'

describe('writing on a page', () => {
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

  const stored = async (kind: 'day' | 'week', key: string) =>
    (await api.getNote(kind, key))?.content
  const editor = (name: string) => screen.findByRole('textbox', { name })
  const status = (name: string) => within(screen.getByRole('region', { name })).getByRole('status')

  it('saves what you type shortly after you stop', async () => {
    const { user } = renderApp(server, '/day/2026-10-26')

    // user-event reads "[" as a key name; "[[" types a literal "[".
    await user.type(await editor(TODAY), '- [[ ] Finish report')

    await waitFor(async () => {
      expect(await stored('day', '2026-10-26')).toBe('- [ ] Finish report')
    })
    await waitFor(() => {
      expect(status(TODAY)).toHaveTextContent('Saved')
    })
  })

  it('writes on the week page too', async () => {
    const { user } = renderApp(server, '/day/2026-10-26')

    await user.type(await editor('Week 44'), '| Squat | [[x] |')

    await waitFor(async () => {
      expect(await stored('week', '2026-10-26')).toBe('| Squat | [x] |')
    })
  })

  it('continues from what was saved before', async () => {
    await api.saveNote('day', '2026-10-26', 'first line', 0)
    const { user } = renderApp(server, '/day/2026-10-26')

    const textbox = await editor(TODAY)
    await waitFor(() => {
      expect(textbox).toHaveValue('first line')
    })
    await user.type(textbox, '\nsecond line')

    await waitFor(async () => {
      expect(await stored('day', '2026-10-26')).toBe('first line\nsecond line')
    })
    expect((await api.getNote('day', '2026-10-26'))?.revision).toBe(2)
  })

  it('saves immediately when you move to another day', async () => {
    const { user, router } = renderApp(server, '/day/2026-10-26')

    await user.type(await editor(TODAY), 'quick note')
    await user.keyboard('{Meta>}{Shift>}[Period]{/Shift}{/Meta}')

    expect(router.state.location.pathname).toBe('/day/2026-10-27')
    await waitFor(async () => {
      expect(await stored('day', '2026-10-26')).toBe('quick note')
    })
  })

  it('marks the day as written in the week strip', async () => {
    const { user } = renderApp(server, '/day/2026-10-26')

    await user.type(await editor(TODAY), 'something')

    expect(
      await screen.findByRole('link', { name: 'Mon 26, today, written' }, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  it('takes in changes saved meanwhile from another device', async () => {
    await api.saveNote('day', '2026-10-26', '- [ ] Call dentist\n- [ ] Run 5km', 0)
    const { user } = renderApp(server, '/day/2026-10-26')
    const textbox = await editor(TODAY)
    await waitFor(() => {
      expect(textbox).toHaveValue('- [ ] Call dentist\n- [ ] Run 5km')
    })

    await api.saveNote('day', '2026-10-26', '- [x] Call dentist\n- [ ] Run 5km', 1) // the phone
    await user.type(textbox, '\nFelt good')

    await waitFor(() => {
      expect(textbox).toHaveValue('- [x] Call dentist\n- [ ] Run 5km\nFelt good')
    })
    expect(await stored('day', '2026-10-26')).toBe('- [x] Call dentist\n- [ ] Run 5km\nFelt good')
  })

  it('stops and keeps your text when the same line was changed elsewhere', async () => {
    await api.saveNote('day', '2026-10-26', 'Run 5km', 0)
    const { user } = renderApp(server, '/day/2026-10-26')
    const textbox = await editor(TODAY)
    await waitFor(() => {
      expect(textbox).toHaveValue('Run 5km')
    })

    await api.saveNote('day', '2026-10-26', 'Run 10km', 1)
    await user.clear(textbox)
    await user.type(textbox, 'Run 8km')

    await waitFor(() => {
      expect(status(TODAY)).toHaveTextContent('Conflict')
    })
    expect(textbox).toHaveValue('Run 8km')
    expect(await stored('day', '2026-10-26')).toBe('Run 10km')
  })

  it('keeps your text while offline and saves when the connection is back', async () => {
    const { user } = renderApp(server, '/day/2026-10-26')
    const textbox = await editor(TODAY)

    server.setOffline(true)
    await user.type(textbox, 'written on the train')
    await waitFor(() => {
      expect(status(TODAY)).toHaveTextContent('Offline')
    })

    server.setOffline(false)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(async () => {
      expect(await stored('day', '2026-10-26')).toBe('written on the train')
    })
    await waitFor(() => {
      expect(status(TODAY)).toHaveTextContent('Saved')
    })
  })

  it('shows what another device wrote when you come back to the window', async () => {
    await api.saveNote('day', '2026-10-26', 'from the laptop', 0)
    renderApp(server, '/day/2026-10-26')
    const textbox = await editor(TODAY)
    await waitFor(() => {
      expect(textbox).toHaveValue('from the laptop')
    })

    await api.saveNote('day', '2026-10-26', 'from the laptop\nfrom the phone', 1)
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })

    await waitFor(() => {
      expect(textbox).toHaveValue('from the laptop\nfrom the phone')
    })
  })

  it('warns before closing the tab with unsaved text', async () => {
    const { user } = renderApp(server, '/day/2026-10-26')
    const textbox = await editor(TODAY)
    server.setOffline(true)
    await user.type(textbox, 'not saved yet')

    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('does not offer editing on read-only neighbour pages', async () => {
    renderApp(server, '/day/2026-10-26')
    await editor(TODAY)

    expect(screen.getAllByRole('textbox')).toHaveLength(2)
  })
})
