import { useEffect, useState } from 'react'

/** How far the pointer must move on screen to count as the user reaching for the mouse. */
const MOUSE_THRESHOLD = 3

const inEditor = (target: EventTarget | null) =>
  target instanceof Element && target.closest('.cm-content') !== null

/**
 * Focus mode (ADR 0013): on while the user works in a page with the keyboard, off as soon as they
 * reach for the mouse, tap, leave the editor or press Escape. Off while `enabled` is false (the
 * command palette or settings are open).
 */
export function useFocusMode(enabled: boolean): boolean {
  const [on, setOn] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let last: { x: number; y: number } | undefined

    const onKeyDown = (event: KeyboardEvent) => {
      // CodeMirror marks keys it used as handled, e.g. Escape closing the slash menu.
      if (event.key === 'Escape') {
        if (!event.defaultPrevented) setOn(false)
      } else if (inEditor(event.target)) setOn(true)
    }
    // Browsers also send mousemove when the page scrolls under a still pointer (the editor
    // following the caret while typing): only a pointer that moved on screen ends focus mode.
    const onMouseMove = (event: MouseEvent) => {
      const position = { x: event.screenX, y: event.screenY }
      const moved = last && Math.hypot(position.x - last.x, position.y - last.y)
      if (moved !== undefined && moved > MOUSE_THRESHOLD) setOn(false)
      last = position
    }
    const end = () => {
      setOn(false)
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!inEditor(event.target)) setOn(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerdown', end)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerdown', end)
      document.removeEventListener('focusin', onFocusIn)
      // Disabled (palette or settings opened) or unmounted: come back without focus mode.
      setOn(false)
    }
  }, [enabled])

  return on
}
