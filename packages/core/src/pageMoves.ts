import type { NoteView, ResolvedLayout } from './layout.ts'

export type Direction = 'left' | 'right' | 'up' | 'down'

/** A panel's place on screen, as fractions of the pages area. */
interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

interface PlacedPage {
  view: NoteView
  rect: Rect
}

// Fractions from sizes are not exact: panels that touch may be a rounding error apart.
const EPSILON = 1e-9

/**
 * The note page next to page `from` in `direction` on screen, if there is one: the nearest page
 * on that side that is level with it, the one overlapping it most when several are as near.
 * Panels without a page to write in (the calendar) are passed over.
 */
export function pageInDirection(
  layout: ResolvedLayout,
  from: Pick<NoteView, 'kind' | 'key'>,
  direction: Direction,
): NoteView | undefined {
  const pages = placePages(layout, { left: 0, top: 0, right: 1, bottom: 1 })
  const start = pages.find((p) => p.view.kind === from.kind && p.view.key === from.key)
  if (start === undefined) return undefined

  let best: { page: PlacedPage; gap: number; overlap: number } | undefined
  for (const page of pages) {
    if (page === start) continue
    const gap = gapTowards(start.rect, page.rect, direction)
    const overlap = levelOverlap(start.rect, page.rect, direction)
    if (gap < -EPSILON || overlap <= EPSILON) continue
    // Pages come in reading order, so on a tie the first (top, left) one stays.
    if (
      best === undefined ||
      gap < best.gap - EPSILON ||
      (gap <= best.gap + EPSILON && overlap > best.overlap + EPSILON)
    )
      best = { page, gap, overlap }
  }
  return best?.page.view
}

/** How far `to` lies beyond `from` in `direction`; negative when it is not on that side. */
function gapTowards(from: Rect, to: Rect, direction: Direction): number {
  switch (direction) {
    case 'left':
      return from.left - to.right
    case 'right':
      return to.left - from.right
    case 'up':
      return from.top - to.bottom
    case 'down':
      return to.top - from.bottom
  }
}

/** How much of `from` and `to` lie level with each other, across `direction`. */
function levelOverlap(from: Rect, to: Rect, direction: Direction): number {
  return direction === 'left' || direction === 'right'
    ? Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top)
    : Math.min(from.right, to.right) - Math.max(from.left, to.left)
}

/** The note pages of `layout` in reading order, each with its place inside `rect`. */
function placePages(layout: ResolvedLayout, rect: Rect): PlacedPage[] {
  if (layout.type === 'panel')
    return layout.view.type === 'note' ? [{ view: layout.view, rect }] : []
  const total = layout.children.reduce((sum, child) => sum + child.size, 0)
  const across = layout.direction === 'row'
  const length = across ? rect.right - rect.left : rect.bottom - rect.top
  let start = across ? rect.left : rect.top
  return layout.children.flatMap((child) => {
    const end = start + (length * child.size) / total
    const childRect = across
      ? { ...rect, left: start, right: end }
      : { ...rect, top: start, bottom: end }
    start = end
    return placePages(child.node, childRect)
  })
}
