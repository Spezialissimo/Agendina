import { useEffect, useState } from 'react'

/** How far the pointer must move on screen to count as the user reaching for the mouse. */
const MOUSE_THRESHOLD = 3

const inEditor = (target: EventTarget | null) =>
  target instanceof Element && target.closest('.cm-content') !== null

/**
 * Focus mode (ADR 0013): on while the user works in a page with the keyboard, off as soon as they
 * reach for the mouse, tap, leave the editor or press Escape. Off while `enabled` is false (the
 * command palette or settings are open) and whenever the focused `day` changes: the new day's
 * editor is a new element, and the keyboard focus that was in the old one is gone.
 */
export function useFocusMode(enabled: boolean, day: string): boolean {
  const [on, setOn] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let active = false
    const set = (value: boolean) => {
      active = value
      setOn(value)
    }
    /** Where the pointer rested; movement is measured from here, so slow movements add up. */
    let anchor: { x: number; y: number } | undefined
    /** Set by the tap that ends focus mode, so its click does not press a button nobody saw. */
    let swallowClick = false

    const onKeyDown = (event: KeyboardEvent) => {
      // CodeMirror marks keys it used as handled, e.g. Escape closing the slash menu.
      if (event.key === 'Escape') {
        if (!event.defaultPrevented) set(false)
      } else if (inEditor(event.target)) set(true)
    }
    // Browsers also send mousemove when the page scrolls under a still pointer (the editor
    // following the caret while typing): only a pointer that moved on screen ends focus mode.
    const onMouseMove = (event: MouseEvent) => {
      const position = { x: event.screenX, y: event.screenY }
      anchor ??= position
      if (Math.hypot(position.x - anchor.x, position.y - anchor.y) <= MOUSE_THRESHOLD) return
      anchor = position
      set(false)
    }
    const onPointerDown = () => {
      swallowClick = active
      set(false)
    }
    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return
      swallowClick = false
      if (event.target instanceof Element && event.target.closest('button, a') !== null) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!inEditor(event.target)) set(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('click', onClick, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('focusin', onFocusIn)
      // Disabled, another day, or unmounted: come back without focus mode.
      setOn(false)
    }
  }, [enabled, day])

  return on
}
