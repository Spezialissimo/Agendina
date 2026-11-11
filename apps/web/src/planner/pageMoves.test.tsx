import type { Layout } from '@agendina/core'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { editorText, placeCursor, selectionOf } from '../test/editor.ts'
import { renderApp } from '../test/render.tsx'
import { settingsWithLayout } from '../test/settings.ts'
import { startTestServer, type TestServer } from '../test/server.ts'

// Vim's h j k l, with ⌃⇧ (keys by physical code, as the app matches KeyboardEvent.code).
const LEFT = '{Control>}{Shift>}[KeyH]{/Shift}{/Control}'
const DOWN = '{Control>}{Shift>}[KeyJ]{/Shift}{/Control}'
const UP = '{Control>}{Shift>}[KeyK]{/Shift}{/Control}'
const RIGHT = '{Control>}{Shift>}[KeyL]{/Shift}{/Control}'
const NEXT_DAY = '{Meta>}{Shift>}[Period]{/Shift}{/Meta}'

const WEDNESDAY = 'Wednesday, October 28, 2026'
const TUESDAY = 'Tuesday, October 27, 2026'

const note = (id: string, kind: 'day' | 'week', offset: number): Layout => ({
  type: 'panel',
  id,
  panel: { type: 'note', kind, offset },
})

/** Gives a focus change that should not happen the time to happen anyway. */
const rest = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('moving the cursor between pages', () => {
  let server: TestServer
  let api: Api

  beforeEach(async () => {
    localStorage.clear()
    server = await startTestServer()
    await server.signup()
    api = new Api(server.fetch)
  })

  afterEach(async () => {
    await server.close()
  })

  /** Today is Monday 26 October 2026 (ISO week 44: 26 Oct – 1 Nov). */
  const open = async (path: string, platform: 'mac' | 'other' = 'mac') => {
    const view = renderApp(server, path, { platform, now: new Date('2026-10-26T09:00:00') })
    // The pages are on show (their layouts have no week strip to wait for).
    await screen.findAllByRole('textbox')
    return view
  }
  const editor = (name: string) => screen.findByRole('textbox', { name })
  const expectFocusIn = async (name: string) => {
    const found = await editor(name)
    await waitFor(() => {
      expect(found).toHaveFocus()
    })
    return found
  }

  it('⌃⇧H and ⌃⇧L move between the week page and the day page beside it', async () => {
    await api.saveNote('day', '2026-10-28', 'Call mum', 0)
    const { user } = await open('/day/2026-10-28')
    placeCursor(await editor(WEDNESDAY), 4)

    await user.keyboard(LEFT)
    await expectFocusIn('Week 44')

    await user.keyboard(RIGHT)
    const day = await expectFocusIn(WEDNESDAY)
    // Where it was left.
    expect(selectionOf(day)).toEqual({ anchor: 4, head: 4 })
  })

  it('⌃⇧K and ⌃⇧J move between pages above and below each other', async () => {
    await api.saveSettings(
      settingsWithLayout({
        type: 'split',
        id: 'days',
        direction: 'column',
        children: [
          { size: 0.5, node: note('yesterday', 'day', -1) },
          { size: 0.5, node: note('today', 'day', 0) },
        ],
      }),
    )
    const { user, router } = await open('/day/2026-10-28')
    placeCursor(await editor(WEDNESDAY), 0)

    await user.keyboard(UP)
    await expectFocusIn(TUESDAY)
    // A neighbour page is written in where it is: the selected day stays the same.
    expect(router.state.location.pathname).toBe('/day/2026-10-28')

    await user.keyboard(DOWN)
    await expectFocusIn(WEDNESDAY)
  })

  it('leaves the cursor where it is when there is no page on that side', async () => {
    await api.saveNote('day', '2026-10-28', 'Call mum\nBuy milk', 0)
    const { user } = await open('/day/2026-10-28')
    const day = await editor(WEDNESDAY)
    placeCursor(day, 12)

    await user.keyboard(RIGHT)
    await user.keyboard(UP)
    await rest()

    expect(day).toHaveFocus()
    expect(selectionOf(day)).toEqual({ anchor: 12, head: 12 })
    expect(editorText(day)).toBe('Call mum\nBuy milk')
  })

  it("wins over the editor's own Ctrl+Shift+K, delete line, off a Mac", async () => {
    // jsdom's editor, like the app on 'other', reads Mod as Ctrl.
    await api.saveSettings(
      settingsWithLayout({
        type: 'split',
        id: 'days',
        direction: 'column',
        children: [
          { size: 0.5, node: note('yesterday', 'day', -1) },
          { size: 0.5, node: note('today', 'day', 0) },
        ],
      }),
    )
    await api.saveNote('day', '2026-10-28', 'Call mum\nBuy milk', 0)
    const { user } = await open('/day/2026-10-28', 'other')
    const day = await editor(WEDNESDAY)
    placeCursor(day, 12)

    await user.keyboard('{Control>}{Shift>}[KeyK]{/Shift}{/Control}')

    await expectFocusIn(TUESDAY)
    expect(editorText(day)).toBe('Call mum\nBuy milk')
  })

  it('puts the cursor in the selected day page when no page was written in yet', async () => {
    const { user } = await open('/day/2026-10-28')
    await editor(WEDNESDAY)

    await user.keyboard(LEFT)

    await expectFocusIn(WEDNESDAY)
  })

  it('keeps the side it moved to when navigating to another day', async () => {
    const { user } = await open('/day/2026-10-28')
    placeCursor(await editor(WEDNESDAY), 0)

    await user.keyboard(LEFT)
    await expectFocusIn('Week 44')
    await user.keyboard(NEXT_DAY)

    await screen.findByRole('textbox', { name: 'Thursday, October 29, 2026' })
    await expectFocusIn('Week 44')
  })

  it('offers the four moves in the command palette', async () => {
    const { user } = await open('/day/2026-10-28')

    await user.keyboard('{Meta>}k{/Meta}')

    const palette = screen.getByRole('dialog', { name: 'Commands' })
    for (const name of ['Page to the left', 'Page to the right', 'Page above', 'Page below'])
      expect(within(palette).getByRole('option', { name: new RegExp(name) })).toBeInTheDocument()
  })
})
