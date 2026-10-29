import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '@agendina/contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Api } from '../api/client.ts'
import { placeCursor } from '../test/editor.ts'
import { renderApp } from '../test/render.tsx'
import { startTestServer, type TestServer } from '../test/server.ts'

describe('focus mode', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await startTestServer()
    await server.signup()
  })

  afterEach(async () => {
    await server.close()
  })

  const open = async () => {
    const view = renderApp(server, '/day/2026-10-26')
    const day = await screen.findByRole('textbox', { name: 'Monday, 26 October 2026' })
    placeCursor(day, 0)
    // Moving the cursor into the page starts focus mode; start each test with it off.
    moveMouse(0, 50)
    const planner = () => view.container.querySelector('.planner')
    /** Presses a key in the page and checks that focus mode is on, before testing what ends it. */
    const focus = (key = 'a') => {
      fireEvent.keyDown(day, { key })
      expect(planner()).toHaveAttribute('data-focus-mode')
    }
    return { ...view, day, planner, focus }
  }

  /** A real mouse sends several events while it moves; two are enough to measure a distance. */
  const moveMouse = (from: number, to: number) => {
    fireEvent.mouseMove(document, { screenX: from, screenY: 100 })
    fireEvent.mouseMove(document, { screenX: to, screenY: 100 })
  }

  it('starts when a key is pressed in a page', async () => {
    const { day, planner } = await open()
    expect(planner()).not.toHaveAttribute('data-focus-mode')

    fireEvent.keyDown(day, { key: 'a' })

    expect(planner()).toHaveAttribute('data-focus-mode')
  })

  it('starts on arrow keys too', async () => {
    const { day, planner } = await open()

    fireEvent.keyDown(day, { key: 'ArrowDown' })

    expect(planner()).toHaveAttribute('data-focus-mode')
  })

  it('never starts when turned off in the settings', async () => {
    await new Api(server.fetch).saveSettings({
      ...DEFAULT_SETTINGS,
      focusMode: { enabled: false, idleMs: 1500 },
    })
    const { day, planner } = await open()
    const week = await screen.findByRole('textbox', { name: 'Week 44' })

    fireEvent.keyDown(day, { key: 'a' })
    placeCursor(week, 0)

    expect(planner()).not.toHaveAttribute('data-focus-mode')
  })

  it('does not start on keys pressed outside a page', async () => {
    const { planner } = await open()

    fireEvent.keyDown(document.body, { key: 'a' })

    expect(planner()).not.toHaveAttribute('data-focus-mode')
  })

  it('starts when a click moves the keyboard focus into a page', async () => {
    const { planner } = await open()
    const week = screen.getByRole('textbox', { name: 'Week 44' })

    fireEvent.pointerDown(week)
    placeCursor(week, 0)

    expect(planner()).toHaveAttribute('data-focus-mode')
  })

  it('does not start on a click in the page that already has the cursor', async () => {
    const { day, planner } = await open()

    fireEvent.pointerDown(day)
    placeCursor(day, 0)

    expect(planner()).not.toHaveAttribute('data-focus-mode')
  })

  it('ends when the mouse moves', async () => {
    const { planner, focus } = await open()
    focus()

    moveMouse(100, 120)

    expect(planner()).not.toHaveAttribute('data-focus-mode')
  })

  it('ignores mouse events that do not move the pointer', async () => {
    const { planner, focus } = await open()
    focus()

    // What browsers send when the page scrolls under a still pointer (the editor following the caret).
    // The pointer rests where open() left it.
    moveMouse(50, 50)
    moveMouse(50, 52)

    expect(planner()).toHaveAttribute('data-focus-mode')
  })

  it('ends when the mouse moves slowly', async () => {
    const { planner, focus } = await open()
    focus()

    // A slow nudge arrives as many events a pixel apart.
    for (let x = 100; x <= 110; x++) fireEvent.mouseMove(document, { screenX: x, screenY: 100 })

    expect(planner()).not.toHaveAttribute('data-focus-mode')
  })

  it('ends when a shortcut moves to another day', async () => {
    const { user, router, planner, focus } = await open()
    focus()

    await user.keyboard('{Meta>}{Shift>}[Period]{/Shift}{/Meta}')

    expect(router.state.location.pathname).toBe('/day/2026-10-27')
    expect(planner()).not.toHaveAttribute('data-focus-mode')
  })

  it('ends on pointer down', async () => {
    const { planner, focus } = await open()
    focus()

    fireEvent.pointerDown(document.body)

    expect(planner()).not.toHaveAttribute('data-focus-mode')
  })

  it('ends when keyboard focus leaves the editor', async () => {
    const { planner, focus } = await open()
    focus('Tab')

    act(() => {
      screen.getByRole('button', { name: 'Settings' }).focus()
    })

    expect(planner()).not.toHaveAttribute('data-focus-mode')
  })

  it('ends on Escape and keeps the cursor in the page', async () => {
    const { day, planner, focus } = await open()
    focus()

    fireEvent.keyDown(day, { key: 'Escape' })

    expect(planner()).not.toHaveAttribute('data-focus-mode')
    expect(day).toHaveFocus()
  })

  it('stays off after ending until the next key in a page', async () => {
    const { day, planner, focus } = await open()
    focus()
    moveMouse(100, 120)
    moveMouse(120, 140)
    expect(planner()).not.toHaveAttribute('data-focus-mode')

    fireEvent.keyDown(day, { key: 'b' })

    expect(planner()).toHaveAttribute('data-focus-mode')
  })

  it('ends when the command palette opens', async () => {
    const { user, planner, focus } = await open()
    focus()

    await user.keyboard('{Meta>}{k}{/Meta}')

    expect(screen.getByRole('dialog', { name: 'Commands' })).toBeInTheDocument()
    expect(planner()).not.toHaveAttribute('data-focus-mode')
  })

  it('starts in the template editor too', async () => {
    const { user, planner } = await open()
    const dayPage = screen.getByRole('region', { name: 'Monday, 26 October 2026' })
    await user.click(within(dayPage).getByRole('button', { name: 'Edit day template' }))
    const template = await screen.findByRole('textbox', { name: 'Day template' })
    placeCursor(template, 0)

    fireEvent.keyDown(template, { key: 'a' })

    await waitFor(() => {
      expect(planner()).toHaveAttribute('data-focus-mode')
    })
  })

  describe('when the mouse rests', () => {
    /** The app is loaded with real timers; the wait starts again from the click under fake ones. */
    const openResting = async () => {
      const view = await open()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      fireEvent.pointerDown(view.day)
      return view
    }
    const wait = (ms: number) => {
      act(() => {
        vi.advanceTimersByTime(ms)
      })
    }

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('starts after 1.5 seconds with the cursor in a page', async () => {
      const { planner } = await openResting()

      wait(1400)
      expect(planner()).not.toHaveAttribute('data-focus-mode')
      wait(100)
      expect(planner()).toHaveAttribute('data-focus-mode')
    })

    it('waits as long as the settings say', async () => {
      await new Api(server.fetch).saveSettings({
        ...DEFAULT_SETTINGS,
        focusMode: { enabled: true, idleMs: 5000 },
      })
      const { planner } = await openResting()

      wait(4900)
      expect(planner()).not.toHaveAttribute('data-focus-mode')
      wait(100)
      expect(planner()).toHaveAttribute('data-focus-mode')
    })

    it('waits again after the mouse moves', async () => {
      const { planner } = await openResting()

      wait(1000)
      moveMouse(100, 120)
      wait(1000)
      expect(planner()).not.toHaveAttribute('data-focus-mode')
      wait(500)
      expect(planner()).toHaveAttribute('data-focus-mode')
    })

    it('comes back after Escape while the mouse rests', async () => {
      const { day, planner, focus } = await openResting()
      focus()
      fireEvent.keyDown(day, { key: 'Escape' })
      expect(planner()).not.toHaveAttribute('data-focus-mode')

      wait(3000)

      expect(planner()).toHaveAttribute('data-focus-mode')
    })

    it('does not start when the cursor is not in a page', async () => {
      const { planner } = await openResting()
      act(() => {
        screen.getByRole('button', { name: 'Settings' }).focus()
      })

      wait(3000)

      expect(planner()).not.toHaveAttribute('data-focus-mode')
    })

    it('does not start while another window is in front', async () => {
      const { planner } = await openResting()
      vi.spyOn(document, 'hasFocus').mockReturnValue(false)

      wait(3000)

      expect(planner()).not.toHaveAttribute('data-focus-mode')
    })
  })
})
