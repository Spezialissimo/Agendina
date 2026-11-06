import { afterEach, describe, expect, it } from 'vitest'
import { blurWhenKeyboardCloses } from './softKeyboard.ts'

/**
 * A phone (Pixel 8 figures) the test resizes by hand, as the browser does around a keyboard:
 * the visual viewport is 783 px tall with the keyboard closed and 462 with it open.
 */
function setup(initialHeight = 783) {
  const viewport = Object.assign(new EventTarget(), { height: initialHeight })
  const screen = { width: 411, height: 915, orientation: { type: 'portrait-primary' } }
  const win = { innerWidth: 869, document, visualViewport: viewport, screen }
  const stop = blurWhenKeyboardCloses(win)
  const resize = (height: number) => {
    viewport.height = height
    viewport.dispatchEvent(new Event('resize'))
  }
  const editor = document.createElement('div')
  editor.className = 'cm-content'
  editor.tabIndex = 0
  document.body.append(editor)
  return { resize, editor, stop, win, screen }
}

describe('blurWhenKeyboardCloses', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('takes the cursor out of the text once the on-screen keyboard closes', () => {
    const { resize, editor } = setup()
    editor.focus()
    resize(462) // keyboard up
    expect(document.activeElement).toBe(editor)

    resize(783) // keyboard down

    expect(document.activeElement).not.toBe(editor)
  })

  it('does so the first time, whatever height the page reported before it was laid out', () => {
    const { resize, editor } = setup(1864)
    editor.focus()

    resize(462)
    resize(783)

    expect(document.activeElement).not.toBe(editor)
  })

  it('does so the first time when the page layout width changed after the start', () => {
    const { resize, editor, win } = setup()
    editor.focus()

    win.innerWidth = 411
    resize(462)
    win.innerWidth = 869
    resize(783)

    expect(document.activeElement).not.toBe(editor)
  })

  it('keeps the focus when the viewport shrinks without a keyboard coming first', () => {
    const { resize, editor } = setup()
    editor.focus()

    resize(700) // a smaller window, or a physical keyboard: no soft keyboard in between
    resize(783)

    expect(document.activeElement).toBe(editor)
  })

  it('does not take a rotation for a keyboard', () => {
    const { resize, editor, screen } = setup()
    editor.focus()
    resize(462)

    // Rotated to landscape while the keyboard was up: the viewport briefly reports its new size.
    screen.orientation.type = 'landscape-primary'
    screen.width = 915
    screen.height = 411
    resize(380)

    expect(document.activeElement).toBe(editor)
  })

  it('leaves the focus alone when it is not in an editor', () => {
    const { resize } = setup()
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()

    resize(462)
    resize(783)

    expect(document.activeElement).toBe(input)
  })

  it('does nothing without a visual viewport, and stops when asked', () => {
    expect(() =>
      blurWhenKeyboardCloses({
        document,
        visualViewport: null,
        screen: { width: 400, height: 800 },
      }),
    ).not.toThrow()
    const { resize, editor, stop } = setup()
    editor.focus()
    resize(462)
    stop()

    resize(783)

    expect(document.activeElement).toBe(editor)
  })
})
