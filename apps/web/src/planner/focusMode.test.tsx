import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

  it('does not start on keys pressed outside a page', async () => {
    const { planner } = await open()

    fireEvent.keyDown(document.body, { key: 'a' })

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
    moveMouse(100, 100)
    moveMouse(100, 102)

    expect(planner()).toHaveAttribute('data-focus-mode')
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
})
