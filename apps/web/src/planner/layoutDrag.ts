import type { PanelSide } from '@agendina/core'
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

/** Where a panel is on the screen. */
export interface PanelRect {
  id: string
  left: number
  top: number
  width: number
  height: number
}

/** The panels under `root`, as they are on the screen now. */
export function measurePanels(root: HTMLElement | null): PanelRect[] {
  if (root === null) return []
  return [...root.querySelectorAll<HTMLElement>('[data-panel-id]')].map((element) => {
    const { left, top, width, height } = element.getBoundingClientRect()
    return { id: element.dataset.panelId ?? '', left, top, width, height }
  })
}

/** The panel under the pointer and the side of it the pointer is nearest to. */
export function dropTarget(
  rects: PanelRect[],
  x: number,
  y: number,
): { id: string; side: PanelSide } | undefined {
  const rect = rects.find(
    (r) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height,
  )
  if (rect === undefined || rect.width === 0 || rect.height === 0) return undefined
  const distances: [PanelSide, number][] = [
    ['left', (x - rect.left) / rect.width],
    ['right', (rect.left + rect.width - x) / rect.width],
    ['top', (y - rect.top) / rect.height],
    ['bottom', (rect.top + rect.height - y) / rect.height],
  ]
  const [nearest] = distances.sort((a, b) => a[1] - b[1])
  return nearest === undefined ? undefined : { id: rect.id, side: nearest[0] }
}

type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

const GLIDE_MS = 240
const APPEAR: KeyframeAnimationOptions = {
  duration: GLIDE_MS,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
}
const STEPS = 16

/** Fast at first, then settling. */
const easeOut = (t: number) => 1 - (1 - t) ** 3

/**
 * Animates `element` from the box it had (`dx`, `dy` away, `sx` by `sy` times its size) to the
 * one it has. Its body is scaled the other way at every step, so that the text keeps its shape
 * while the box around it changes size.
 */
function glide(element: HTMLElement, dx: number, dy: number, sx: number, sy: number): void {
  const box: Keyframe[] = []
  const body: Keyframe[] = []
  for (let step = 0; step <= STEPS; step++) {
    const left = 1 - easeOut(step / STEPS)
    const x = 1 + (sx - 1) * left
    const y = 1 + (sy - 1) * left
    box.push({
      transformOrigin: 'top left',
      transform: `translate(${String(dx * left)}px, ${String(dy * left)}px) scale(${String(x)}, ${String(y)})`,
    })
    body.push({
      transformOrigin: 'top left',
      transform: `scale(${String(1 / x)}, ${String(1 / y)})`,
    })
  }
  element.animate(box, GLIDE_MS)
  element.querySelector<HTMLElement>('[data-panel-body]')?.animate(body, GLIDE_MS)
}

/**
 * Makes the panels under `container` glide to their new place and size whenever `layout` changes,
 * instead of jumping there (the "FLIP" technique: measure, then animate from where they were).
 * New panels fade in. Nothing moves for people who asked their system for less motion.
 *
 * `also` is anything else after which panels should glide. The function returned says where a
 * panel is coming from when that is not where it was laid out (a card dropped from the pointer).
 */
export function useGlidingPanels(
  container: RefObject<HTMLElement | null>,
  layout: unknown,
  also?: unknown,
): (panelId: string, from: Box) => void {
  const before = useRef(new Map<string, Box>())
  useLayoutEffect(() => {
    const root = container.current
    if (root === null) return
    // Neither is in every environment (jsdom has no animations and no media queries).
    const still =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const now = new Map<string, Box>()
    for (const element of root.querySelectorAll<HTMLElement>('[data-panel-id]')) {
      const animations = element as Partial<Pick<HTMLElement, 'animate' | 'getAnimations'>>
      // A glide still running would be measured half-way.
      for (const running of animations.getAnimations?.call(element, { subtree: true }) ?? []) {
        running.cancel()
      }
      const id = element.dataset.panelId ?? ''
      const rect = element.getBoundingClientRect()
      now.set(id, rect)
      if (still || animations.animate === undefined || before.current.size === 0) continue
      const was = before.current.get(id)
      if (was === undefined) {
        element.animate(
          [
            { opacity: 0, transform: 'scale(0.94)' },
            { opacity: 1, transform: 'none' },
          ],
          APPEAR,
        )
        continue
      }
      if (rect.width === 0 || rect.height === 0 || was.width === 0 || was.height === 0) continue
      const dx = was.left - rect.left
      const dy = was.top - rect.top
      const sx = was.width / rect.width
      const sy = was.height / rect.height
      const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5
      const resized = Math.abs(sx - 1) > 0.005 || Math.abs(sy - 1) > 0.005
      if (!moved && !resized) continue
      glide(element, dx, dy, sx, sy)
    }
    before.current = now
  }, [container, layout, also])
  return useCallback((panelId, from) => {
    before.current.set(panelId, from)
  }, [])
}
