import { withLayouts } from '@agendina/contract'
import type { Layout } from '@agendina/core'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Api, type FetchFn } from '../api/client.ts'
import { placeCursor, selectionOf } from '../test/editor.ts'
import { renderApp } from '../test/render.tsx'
import { settingsWithLayout } from '../test/settings.ts'
import { startTestServer, type TestServer } from '../test/server.ts'

// Keys by physical code, as in commands.test.tsx.
const NEXT_DAY = '{Meta>}{Shift>}[Period]{/Shift}{/Meta}'
const PREVIOUS_DAY = '{Meta>}{Shift>}[Comma]{/Shift}{/Meta}'
const NEXT_WEEK = '{Meta>}{Alt>}{Shift>}[Period]{/Shift}{/Alt}{/Meta}'
const PREVIOUS_WEEK = '{Meta>}{Alt>}{Shift>}[Comma]{/Shift}{/Alt}{/Meta}'
const TODAY = '{Meta>}{Alt>}{t}{/Alt}{/Meta}'

const at = (anchor: number, head = anchor) => ({ anchor, head })

/** Gives a focus request that should not happen the time to happen anyway. */
const rest = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('focus follows navigation', () => {
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
  const open = async (path: string, through: TestServer = server) => {
    const view = renderApp(through, path, { now: new Date('2026-10-26T09:00:00') })
    await screen.findByRole('navigation', { name: 'Week' })
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

  /**
   * The test server, with one page's note held back until `release()`: the page is still loading
   * when the shortcut runs, as on a slow connection.
   */
  const holdingBack = (path: string) => {
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetch: FetchFn = async (input, init) => {
      if (input === `/api/notes/${path}` && (init?.method ?? 'GET') === 'GET') await held
      return server.fetch(input, init)
    }
    return { through: { ...server, fetch }, release }
  }

  describe('the cursor', () => {
    it('lands at the end of a page with no remembered position', async () => {
      await api.saveNote('day', '2026-10-29', 'Call mum', 0)
      const { user } = await open('/day/2026-10-28')
      await editor('Wednesday, October 28, 2026')

      await user.keyboard(NEXT_DAY)

      const thursday = await expectFocusIn('Thursday, October 29, 2026')
      expect(selectionOf(thursday)).toEqual(at('Call mum'.length))
    })

    it('returns to where you left off on a day page, selection included', async () => {
      await api.saveNote('day', '2026-10-29', 'Call mum about Sunday', 0)
      const { user } = await open('/day/2026-10-29')
      placeCursor(await editor('Thursday, October 29, 2026'), 5, 8)

      await user.keyboard(NEXT_DAY)
      await expectFocusIn('Friday, October 30, 2026')
      await user.keyboard(PREVIOUS_DAY)

      const thursday = await expectFocusIn('Thursday, October 29, 2026')
      expect(selectionOf(thursday)).toEqual(at(5, 8))
    })

    it('returns to where you left off on a week page', async () => {
      await api.saveNote('week', '2026-10-26', 'Plan the week', 0)
      const { user } = await open('/day/2026-10-28')
      placeCursor(await editor('Week 44'), 4)

      await user.keyboard(NEXT_WEEK)
      await expectFocusIn('Week 45')
      await user.keyboard(PREVIOUS_WEEK)

      const week = await expectFocusIn('Week 44')
      expect(selectionOf(week)).toEqual(at(4))
    })

    it('remembers positions across a reload, clamped into a text changed elsewhere', async () => {
      await api.saveNote('day', '2026-10-29', 'Hello world', 0)
      const first = await open('/day/2026-10-29')
      placeCursor(await editor('Thursday, October 29, 2026'), 11)
      first.unmount()
      // Another device shortens the page.
      await api.saveNote('day', '2026-10-29', 'Hi', 1)

      const { user } = await open('/day/2026-10-30')
      await editor('Friday, October 30, 2026')
      await user.keyboard(PREVIOUS_DAY)

      const thursday = await expectFocusIn('Thursday, October 29, 2026')
      expect(selectionOf(thursday)).toEqual(at(2))
    })

    it('remembers the last three day pages only', async () => {
      for (const key of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'])
        await api.saveNote('day', key, 'abcdef', 0)
      const { user } = await open('/day/2026-10-26')
      placeCursor(await editor('Monday, October 26, 2026'), 1)
      for (const name of [
        'Tuesday, October 27, 2026',
        'Wednesday, October 28, 2026',
        'Thursday, October 29, 2026',
      ]) {
        await user.keyboard(NEXT_DAY)
        placeCursor(await expectFocusIn(name), 1)
      }

      // Monday was pushed out by Thursday: back at the end. Tuesday is still remembered.
      await user.keyboard(TODAY)
      expect(selectionOf(await expectFocusIn('Monday, October 26, 2026'))).toEqual(at(6))
      await user.keyboard(NEXT_DAY)
      expect(selectionOf(await expectFocusIn('Tuesday, October 27, 2026'))).toEqual(at(1))
    })
  })

  describe('which page gets focus', () => {
    it('the day page, when no page had focus', async () => {
      const { user } = await open('/day/2026-10-28')
      await editor('Wednesday, October 28, 2026')

      await user.keyboard(NEXT_WEEK)

      await expectFocusIn('Wednesday, November 4, 2026')
    })

    it('the day page, after a click on the week strip', async () => {
      const { user } = await open('/day/2026-10-28')
      await user.click(
        within(screen.getByRole('navigation', { name: 'Week' })).getByRole('link', {
          name: /^Thu 29/,
        }),
      )
      await editor('Thursday, October 29, 2026')

      await user.keyboard(NEXT_DAY)

      await expectFocusIn('Friday, October 30, 2026')
    })

    it('the day page, when you were typing in it and a week shortcut moves both pages', async () => {
      const { user } = await open('/day/2026-10-28')
      placeCursor(await editor('Wednesday, October 28, 2026'), 0)

      await user.keyboard(NEXT_WEEK)

      await expectFocusIn('Wednesday, November 4, 2026')
    })

    it('the week page, when you were typing in it and a week shortcut moves both pages', async () => {
      const { user } = await open('/day/2026-10-28')
      placeCursor(await editor('Week 44'), 0)

      await user.keyboard(NEXT_WEEK)

      await expectFocusIn('Week 45')
    })

    it('the day page, when the layout chosen since has no week page', async () => {
      await api.saveSettings(
        settingsWithLayout({
          type: 'panel',
          id: 'd',
          panel: { type: 'note', kind: 'day', offset: 0 },
        }),
      )
      const saved = await api.settings()
      await api.saveSettings(
        withLayouts({
          ...saved,
          layouts: {
            ...saved.layouts,
            active: { ...saved.layouts.active, desktop: 'open-planner' },
          },
        }),
      )
      const { user } = await open('/day/2026-10-28')
      placeCursor(await editor('Week 44'), 0)

      // The mouse moves first, which ends focus mode (see 'by mouse').
      fireEvent.mouseMove(document, { clientX: 0, clientY: 100 })
      fireEvent.mouseMove(document, { clientX: 50, clientY: 100 })
      await user.click(screen.getByRole('button', { name: 'Settings' }))
      await user.click(screen.getByRole('radio', { name: 'Custom layout 1' }))
      await user.click(screen.getByRole('button', { name: 'Close' }))
      await user.keyboard(NEXT_DAY)

      await expectFocusIn('Thursday, October 29, 2026')
    })

    it('stays in the week page, untouched, when a day shortcut stays in the same week', async () => {
      await api.saveNote('week', '2026-10-26', 'Plan the week', 0)
      const { user } = await open('/day/2026-10-28')
      const week = await editor('Week 44')
      placeCursor(week, 2)

      await user.keyboard(NEXT_DAY)
      await editor('Thursday, October 29, 2026')

      expect(screen.getByRole('textbox', { name: 'Week 44' })).toBe(week)
      expect(week).toHaveFocus()
      expect(selectionOf(week)).toEqual(at(2))
    })

    it('the next week page, when a day shortcut crosses into another week', async () => {
      const { user } = await open('/day/2026-11-01')
      placeCursor(await editor('Week 44'), 0)

      await user.keyboard(NEXT_DAY)

      await expectFocusIn('Week 45')
    })

    it('today’s page with ⌥⌘T', async () => {
      const { user } = await open('/day/2026-10-28')
      await editor('Wednesday, October 28, 2026')

      await user.keyboard(TODAY)

      await expectFocusIn('Monday, October 26, 2026')
    })

    it('today’s page with ⌥⌘T when it is already open', async () => {
      const { user } = await open('/day/2026-10-26')
      await editor('Monday, October 26, 2026')

      await user.keyboard(TODAY)

      await expectFocusIn('Monday, October 26, 2026')
    })

    it('the page you were typing in before opening the command palette', async () => {
      const { user } = await open('/day/2026-10-28')
      placeCursor(await editor('Week 44'), 0)

      await user.keyboard('{Meta>}{k}{/Meta}')
      await user.keyboard('next week{Enter}')

      await expectFocusIn('Week 45')
    })

    it('the selected page, not a neighbour of the same kind', async () => {
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
      const { user } = await open('/day/2026-10-28')
      // Writing in yesterday's page, a neighbour.
      placeCursor(await editor('Tuesday, October 27, 2026'), 0)

      await user.keyboard(NEXT_DAY)

      await expectFocusIn('Thursday, October 29, 2026')
      const yesterday = screen.getByRole('region', { name: 'Wednesday, October 28, 2026' })
      expect(yesterday).not.toContainElement(document.activeElement as HTMLElement)
    })

    it('the week page, in a layout without a day page', async () => {
      const layout: Layout = {
        type: 'panel',
        id: 'week',
        panel: { type: 'note', kind: 'week', offset: 0 },
      }
      await api.saveSettings(settingsWithLayout(layout))
      const { user } = await open('/day/2026-10-28')
      await editor('Week 44')

      await user.keyboard(NEXT_WEEK)

      await expectFocusIn('Week 45')
    })
  })

  describe('by mouse', () => {
    const strip = () => screen.getByRole('navigation', { name: 'Week' })
    /**
     * Clicks like a person: the mouse moves first. That ends focus mode, whose first click would
     * only reveal the buttons it hid (see focusMode.test.tsx).
     */
    const click = async (user: ReturnType<typeof renderApp>['user'], element: Element) => {
      fireEvent.mouseMove(document, { clientX: 0, clientY: 100 })
      fireEvent.mouseMove(document, { clientX: 50, clientY: 100 })
      await user.click(element)
    }

    it('a day clicked in the week strip, at its remembered position', async () => {
      await api.saveNote('day', '2026-10-29', 'Call mum', 0)
      const { user } = await open('/day/2026-10-29')
      placeCursor(await editor('Thursday, October 29, 2026'), 2)
      await user.keyboard(NEXT_DAY)
      await expectFocusIn('Friday, October 30, 2026')

      await click(user, within(strip()).getByRole('link', { name: /^Thu 29/ }))

      const thursday = await expectFocusIn('Thursday, October 29, 2026')
      expect(selectionOf(thursday)).toEqual(at(2))
    })

    it('the day page for a day clicked in the strip, even from the week page', async () => {
      const { user } = await open('/day/2026-10-28')
      placeCursor(await editor('Week 44'), 0)

      await click(user, within(strip()).getByRole('link', { name: /^Thu 29/ }))

      await expectFocusIn('Thursday, October 29, 2026')
    })

    it('a day picked in the month calendar, at the end of its page', async () => {
      await api.saveNote('day', '2026-11-03', 'Dentist', 0)
      const { user } = await open('/day/2026-10-28')
      await editor('Wednesday, October 28, 2026')

      await click(user, within(strip()).getByRole('button', { name: 'Choose a day' }))
      const calendar = screen.getByRole('dialog', { name: 'October 2026' })
      await click(user, within(calendar).getByRole('button', { name: 'Next month' }))
      await click(
        user,
        within(screen.getByRole('dialog', { name: 'November 2026' })).getByRole('button', {
          name: 'November 3, 2026',
        }),
      )

      const tuesday = await expectFocusIn('Tuesday, November 3, 2026')
      expect(selectionOf(tuesday)).toEqual(at('Dentist'.length))
    })

    it('the day page with the week arrows, when no page had focus', async () => {
      const { user } = await open('/day/2026-10-28')
      await editor('Wednesday, October 28, 2026')

      await click(user, within(strip()).getByRole('button', { name: 'Previous week' }))

      await expectFocusIn('Wednesday, October 21, 2026')
    })

    it('the week page with the week arrows, when you were writing in it', async () => {
      await api.saveNote('week', '2026-10-26', 'Plan the week', 0)
      const { user } = await open('/day/2026-10-28')
      placeCursor(await editor('Week 44'), 4)

      await click(user, within(strip()).getByRole('button', { name: 'Next week' }))
      await expectFocusIn('Week 45')
      await click(user, within(strip()).getByRole('button', { name: 'Previous week' }))

      const week = await expectFocusIn('Week 44')
      expect(selectionOf(week)).toEqual(at(4))
    })

    it('the day page with the week arrows, when you were writing in it', async () => {
      const { user } = await open('/day/2026-10-28')
      placeCursor(await editor('Wednesday, October 28, 2026'), 0)

      await click(user, within(strip()).getByRole('button', { name: 'Next week' }))

      await expectFocusIn('Wednesday, November 4, 2026')
    })

    it('not when merely hovering the strip', async () => {
      const { user, router } = await open('/day/2026-10-28')
      const week = await editor('Week 44')
      placeCursor(week, 0)

      await user.hover(within(strip()).getByRole('link', { name: /^Thu 29/ }))
      await user.hover(within(strip()).getByRole('button', { name: 'Next week' }))

      expect(router.state.location.pathname).toBe('/day/2026-10-28')
      expect(week).toHaveFocus()
    })

    it('not once you have moved on while the page loads', async () => {
      const { through, release } = holdingBack('day/2026-10-29')
      const { user } = await open('/day/2026-10-28', through)
      await editor('Wednesday, October 28, 2026')

      await click(user, within(strip()).getByRole('link', { name: /^Thu 29/ }))
      await user.keyboard('{Meta>}{k}{/Meta}')
      release()

      await editor('Thursday, October 29, 2026')
      expect(screen.getByRole('combobox', { name: 'Search commands' })).toHaveFocus()
    })
  })

  describe('by keyboard on the week strip', () => {
    const strip = () => screen.getByRole('navigation', { name: 'Week' })

    it.each([
      ['Next week', '{Enter}', '/day/2026-11-04', 'Wednesday, November 4, 2026'],
      ['Previous week', ' ', '/day/2026-10-21', 'Wednesday, October 21, 2026'],
      ['Today', '{Enter}', '/day/2026-10-26', 'Monday, October 26, 2026'],
    ])('keeps focus on %s when pressed with the keyboard', async (name, key, path, page) => {
      const { user, router } = await open('/day/2026-10-28')
      await editor('Wednesday, October 28, 2026')
      const button = within(strip()).getByRole('button', { name })
      act(() => {
        button.focus()
      })

      await user.keyboard(key)

      expect(router.state.location.pathname).toBe(path)
      await editor(page)
      await rest()
      expect(button).toHaveFocus()
    })

    it('goes into the page of a day chosen with the keyboard', async () => {
      const { user } = await open('/day/2026-10-28')
      await editor('Wednesday, October 28, 2026')
      act(() => {
        within(strip())
          .getByRole('link', { name: /^Thu 29/ })
          .focus()
      })

      await user.keyboard('{Enter}')

      await expectFocusIn('Thursday, October 29, 2026')
    })
  })

  describe('on touch screens', () => {
    const strip = () => screen.getByRole('navigation', { name: 'Week' })
    const tap = (element: Element) => {
      fireEvent.pointerDown(element, { pointerType: 'touch', pointerId: 1 })
      fireEvent.pointerUp(element, { pointerType: 'touch', pointerId: 1 })
      // A click from a pointer counts presses in `detail`; 0 means Enter or Space.
      fireEvent.click(element, { detail: 1 })
    }

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it.each([
      [
        'a day in the week strip',
        () => within(strip()).getByRole('link', { name: /^Thu 29/ }),
        'Thursday, October 29, 2026',
      ],
      [
        'the week arrow',
        () => within(strip()).getByRole('button', { name: 'Next week' }),
        'Wednesday, November 4, 2026',
      ],
    ])('a tap on %s only changes the page', async (_, target, arrived) => {
      await open('/day/2026-10-28')
      await editor('Wednesday, October 28, 2026')

      tap(target())

      await editor(arrived)
      await rest()
      expect(document.activeElement?.closest('[data-editor]')).toBeNull()
    })

    it('a shortcut from a keyboard still goes into the page after a tap', async () => {
      const { user } = await open('/day/2026-10-28')
      await editor('Wednesday, October 28, 2026')
      tap(within(strip()).getByRole('link', { name: /^Thu 29/ }))
      await editor('Thursday, October 29, 2026')

      await user.keyboard(NEXT_DAY)

      await expectFocusIn('Friday, October 30, 2026')
    })

    it('on a device with only a coarse pointer, a click only changes the page', async () => {
      // A tablet: touch only. Listeners are for CodeMirror, which watches the print query.
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }))
      const { user } = await open('/day/2026-10-28')
      await editor('Wednesday, October 28, 2026')

      await user.click(within(strip()).getByRole('link', { name: /^Thu 29/ }))
      const thursday = await editor('Thursday, October 29, 2026')
      await rest()
      expect(thursday).not.toHaveFocus()

      // A keyboard attached to the tablet still moves focus.
      await user.keyboard(NEXT_DAY)
      await expectFocusIn('Friday, October 30, 2026')
    })
  })

  describe('while the page is loading', () => {
    it('focuses the page once it has loaded', async () => {
      await api.saveNote('day', '2026-10-29', 'Call mum', 0)
      const { through, release } = holdingBack('day/2026-10-29')
      const { user, router } = await open('/day/2026-10-28', through)
      await editor('Wednesday, October 28, 2026')

      await user.keyboard(NEXT_DAY)
      expect(router.state.location.pathname).toBe('/day/2026-10-29')
      expect(screen.queryByRole('textbox', { name: 'Thursday, October 29, 2026' })).toBeNull()
      release()

      const thursday = await expectFocusIn('Thursday, October 29, 2026')
      expect(selectionOf(thursday)).toEqual(at('Call mum'.length))
    })

    it('does not take focus from the command palette opened meanwhile', async () => {
      const { through, release } = holdingBack('day/2026-10-29')
      const { user } = await open('/day/2026-10-28', through)
      await editor('Wednesday, October 28, 2026')

      await user.keyboard(NEXT_DAY)
      await user.keyboard('{Meta>}{k}{/Meta}')
      release()

      await editor('Thursday, October 29, 2026')
      expect(screen.getByRole('combobox', { name: 'Search commands' })).toHaveFocus()
    })

    it('does not take focus from the page you clicked into meanwhile', async () => {
      const { through, release } = holdingBack('day/2026-10-29')
      const { user } = await open('/day/2026-10-28', through)
      await editor('Wednesday, October 28, 2026')

      await user.keyboard(NEXT_DAY)
      const week = await editor('Week 44')
      placeCursor(week, 0)
      release()

      await editor('Thursday, October 29, 2026')
      expect(week).toHaveFocus()
    })

    it('focuses only the page of the last shortcut', async () => {
      const { through, release } = holdingBack('day/2026-10-29')
      const { user, router } = await open('/day/2026-10-28', through)
      await editor('Wednesday, October 28, 2026')

      await user.keyboard(NEXT_DAY)
      await user.keyboard(NEXT_DAY)
      const friday = await expectFocusIn('Friday, October 30, 2026')
      release()

      // Back to Thursday with the browser's back button: the old request must not fire now.
      act(() => {
        void router.navigate(-1)
      })
      await editor('Thursday, October 29, 2026')
      expect(friday).not.toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Thursday, October 29, 2026' })).not.toHaveFocus()
    })

    it('focuses the page of the last of two shortcuts pressed before the first one shows', async () => {
      await open('/day/2026-10-28')
      await editor('Wednesday, October 28, 2026')
      const nextDay = { code: 'Period', key: '>', metaKey: true, shiftKey: true }

      // No act(): React renders on its own schedule, as in the browser.
      fireEvent.keyDown(document.body, nextDay)
      fireEvent.keyDown(document.body, nextDay)

      await expectFocusIn('Friday, October 30, 2026')
    })

    it('not after the browser went to another day meanwhile', async () => {
      const { through, release } = holdingBack('day/2026-10-29')
      const { user, router } = await open('/day/2026-10-28', through)
      await editor('Wednesday, October 28, 2026')

      await user.keyboard(NEXT_DAY)
      // Back, then forward again, with the browser's buttons while Thursday still loads.
      act(() => {
        void router.navigate(-1)
      })
      await editor('Wednesday, October 28, 2026')
      act(() => {
        void router.navigate(1)
      })
      release()

      const thursday = await editor('Thursday, October 29, 2026')
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(thursday).not.toHaveFocus()
    })
  })
})
