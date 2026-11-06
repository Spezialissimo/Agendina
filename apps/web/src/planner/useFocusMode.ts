import { useEffect, useState } from 'react'
import { awaitsUser, isFocusAfterNavigation } from '../editor/focusedEditor.ts'

/** How far the pointer must move on screen to count as the user reaching for the mouse. */
const MOUSE_THRESHOLD = 3

const inEditor = (target: EventTarget | null) =>
  target instanceof Element && target.closest('.cm-content') !== null

/**
 * Focus mode (ADR 0013): on as soon as the user types in a page or moves the keyboard focus into
 * one, or once the mouse has rested for `idleMs` while the cursor blinks in a page; off as soon as
 * they reach for the mouse, tap, leave the editor or press Escape. Off while `enabled` is false
 * (turned off in the settings, or the command palette or settings are open) and whenever the
 * focused `day` changes: the new day's editor is a new element, and the keyboard focus that was in
 * the old one is gone. A cursor a navigation put in a page starts neither, until the user types or
 * clicks in that page: their hand may still be on the mouse, about to click the week arrow again.
 */
export function useFocusMode(enabled: boolean, day: string, idleMs: number): boolean {
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
    let idle: ReturnType<typeof setTimeout> | undefined
    /** (Re)starts the wait for a resting mouse; any sign of the user resets it. */
    const restartIdle = () => {
      clearTimeout(idle)
      idle = setTimeout(() => {
        const target = document.activeElement
        if (document.hasFocus() && inEditor(target) && !awaitsUser(target)) set(true)
      }, idleMs)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // CodeMirror marks keys it used as handled, e.g. Escape closing the slash menu.
      if (event.key === 'Escape') {
        if (!event.defaultPrevented) set(false)
      } else if (inEditor(event.target)) set(true)
      restartIdle()
    }
    // Browsers also send mousemove when the page scrolls under a still pointer (the editor
    // following the caret while typing): only a pointer that moved in the window ends focus mode.
    // Not screenX/Y: WebKit on Linux reports them as 0.
    const onMouseMove = (event: MouseEvent) => {
      const position = { x: event.clientX, y: event.clientY }
      anchor ??= position
      if (Math.hypot(position.x - anchor.x, position.y - anchor.y) <= MOUSE_THRESHOLD) return
      anchor = position
      set(false)
      restartIdle()
    }
    const onPointerDown = () => {
      swallowClick = active
      set(false)
      restartIdle()
    }
    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return
      swallowClick = false
      if (event.target instanceof Element && event.target.closest('button, a') !== null) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    // Focus moving into a page (a click or Tab into it) starts focus mode at once; focus moving
    // anywhere else ends it.
    const onFocusIn = (event: FocusEvent) => {
      // Not when a navigation put the cursor in the new page: the hand may still be on the mouse
      // (clicking the week arrows again); typing starts it.
      if (!isFocusAfterNavigation()) set(inEditor(event.target))
      restartIdle()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('click', onClick, true)
    document.addEventListener('focusin', onFocusIn)
    // Back from another window: the cursor blinks again.
    window.addEventListener('focus', restartIdle)
    restartIdle()
    return () => {
      clearTimeout(idle)
      window.removeEventListener('focus', restartIdle)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('focusin', onFocusIn)
      // Disabled, another day, or unmounted: come back without focus mode.
      setOn(false)
    }
  }, [enabled, day, idleMs])

  return on
}
