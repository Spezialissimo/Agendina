/** How much the visible area must shrink, in CSS px, to count as the on-screen keyboard. */
export const KEYBOARD_MIN_HEIGHT = 150

/**
 * The visible area with the keyboard closed is at least this share of the screen's height (the
 * browser's own bars take the rest). It is the starting point for "full height" until a taller
 * viewport is seen, so a first resize that is already the keyboard opening is recognised.
 */
const FULL_HEIGHT_SHARE = 0.8

interface KeyboardWindow {
  document: Document
  visualViewport: (EventTarget & { height: number }) | null
  screen: {
    width: number
    height: number
    orientation?: { type: string }
  }
  matchMedia?: (query: string) => { matches: boolean }
}

/** Changes on a rotation; unlike `innerWidth` it does not change as the page is laid out. */
const orientationOf = ({ screen }: KeyboardWindow) =>
  screen.orientation?.type ?? (screen.width > screen.height ? 'landscape' : 'portrait')

/**
 * Product rule: when the on-screen keyboard is closed, the cursor leaves the text. Otherwise a tap
 * on a checkbox (or anything else) with the editor still focused raises the keyboard again.
 *
 * The keyboard is seen as the visual viewport shrinking from its full height: the largest height
 * seen in this orientation, at least FULL_HEIGHT_SHARE of the screen. Heights taller than the
 * screen are not real (browsers report them before the page is laid out) and are ignored. A
 * rotation starts over from that minimum rather than from the current height, which may be the
 * keyboard's, and its own resize event is skipped. Only the open-to-closed transition blurs, so
 * with a physical keyboard, where no soft keyboard ever opens, the focus stays. Touch screens
 * only: a resized desktop window is not a keyboard. Returns the function that stops listening;
 * does nothing without a visualViewport.
 */
export function blurWhenKeyboardCloses(win: KeyboardWindow = window): () => void {
  const viewport = win.visualViewport
  if (viewport === null || win.matchMedia?.('(pointer: coarse)').matches === false) {
    return () => undefined
  }
  let orientation = orientationOf(win)
  let seen = 0
  let open = false

  const fullHeight = () => Math.max(seen, win.screen.height * FULL_HEIGHT_SHARE)
  const onResize = () => {
    if (orientationOf(win) !== orientation) {
      orientation = orientationOf(win)
      seen = 0
      open = false
      return
    }
    const height = viewport.height
    if (height > win.screen.height) return
    seen = Math.max(seen, height)
    const nowOpen = fullHeight() - height > KEYBOARD_MIN_HEIGHT
    if (open && !nowOpen) {
      const focused = win.document.activeElement
      if (focused instanceof HTMLElement && focused.closest('.cm-content') !== null) focused.blur()
    }
    open = nowOpen
  }
  viewport.addEventListener('resize', onResize)
  return () => {
    viewport.removeEventListener('resize', onResize)
  }
}
