import { addDays, weekStart, type DayKey, type WeekRule } from './calendar.ts'

/**
 * What a panel shows, relative to the focused day: `note(day, -1)` is the day before,
 * `note(week, 0)` the week containing the focused day.
 */
export interface NotePanel {
  type: 'note'
  kind: 'day' | 'week'
  offset: number
}

/** A month calendar to pick a day from: always the month of the focused day at first. */
export interface CalendarPanel {
  type: 'calendar'
}

/** The days of the focused week, to pick one, with the week arrows and the month pop-up. */
export interface WeekStripPanel {
  type: 'weekStrip'
}

export type Panel = NotePanel | CalendarPanel | WeekStripPanel

export interface PanelNode {
  type: 'panel'
  id: string
  panel: Panel
}

export interface SplitNode {
  type: 'split'
  id: string
  direction: 'row' | 'column'
  /** Sizes are relative to their siblings. */
  children: { node: Layout; size: number }[]
}

/** The pages area below the top bar: a tree of splits whose leaves are panels. */
export type Layout = PanelNode | SplitNode

export interface NoteView {
  type: 'note'
  kind: 'day' | 'week'
  /** The note's key: the day, or the first day of the week. */
  key: DayKey
  /** Offset 0: the page of the selected day. Every note page is written in where it is. */
  selected: boolean
}

export interface CalendarView {
  type: 'calendar'
  /** The focused day: the calendar opens on its month and marks it. */
  focus: DayKey
}

export interface WeekStripView {
  type: 'weekStrip'
  /** The focused day: the strip shows its week and marks it. */
  focus: DayKey
}

export type PanelView = NoteView | CalendarView | WeekStripView

export type ResolvedLayout =
  | { type: 'panel'; id: string; view: PanelView }
  | {
      type: 'split'
      id: string
      direction: 'row' | 'column'
      children: { node: ResolvedLayout; size: number }[]
    }

export const MIN_PANE_SIZE = 0.15

/**
 * The least share of a week strip: the page keeps it no smaller than its content, which is
 * readable at any share, so it only needs to stay above 0.
 */
export const MIN_STRIP_SIZE = 0.02

/** The default layout: the week strip on top, the week page on the left, the day on the right. */
export const OPEN_PLANNER: Layout = {
  type: 'split',
  id: 'planner',
  direction: 'column',
  children: [
    // A low strip: its content keeps it as tall as it needs.
    { size: 0.1, node: { type: 'panel', id: 'strip', panel: { type: 'weekStrip' } } },
    {
      size: 0.9,
      node: {
        type: 'split',
        id: 'pages',
        direction: 'row',
        children: [
          {
            size: 0.45,
            node: { type: 'panel', id: 'week', panel: { type: 'note', kind: 'week', offset: 0 } },
          },
          {
            size: 0.55,
            node: { type: 'panel', id: 'day', panel: { type: 'note', kind: 'day', offset: 0 } },
          },
        ],
      },
    },
  ],
}

export function resolveLayout(layout: Layout, focus: DayKey, rule: WeekRule): ResolvedLayout {
  if (layout.type === 'panel') {
    const view: PanelView =
      layout.panel.type === 'note'
        ? resolveNote(layout.panel, focus, rule)
        : { type: layout.panel.type, focus }
    return { type: 'panel', id: layout.id, view }
  }
  return {
    type: 'split',
    id: layout.id,
    direction: layout.direction,
    children: layout.children.map(({ node, size }) => ({
      node: resolveLayout(node, focus, rule),
      size,
    })),
  }
}

/**
 * Returns a copy of `layout` where the split `splitId` has the given sizes, as fractions that
 * add up to 1 and are at least `MIN_PANE_SIZE` each (`MIN_STRIP_SIZE` for a week strip).
 */
export function setSplitSizes(layout: Layout, splitId: string, sizes: number[]): Layout {
  if (!collectSplitIds(layout).includes(splitId)) {
    throw new Error(`Layout has no split "${splitId}"`)
  }
  const update = (node: Layout): Layout => {
    if (node.type === 'panel') return node
    if (node.id !== splitId) {
      return {
        ...node,
        children: node.children.map((child) => ({ ...child, node: update(child.node) })),
      }
    }
    if (sizes.length !== node.children.length) {
      throw new Error(`Split "${splitId}" needs ${node.children.length} sizes, got ${sizes.length}`)
    }
    const fractions = clampFractions(
      sizes,
      node.children.map((child) => minimumSize(child.node)),
    )
    return {
      ...node,
      children: node.children.map((child, i) => ({ ...child, size: fractions[i] as number })),
    }
  }
  return update(layout)
}

/** The selected page of `kind` (offset 0), if the layout shows one. */
export function selectedNote(layout: ResolvedLayout, kind: NoteView['kind']): NoteView | undefined {
  if (layout.type === 'panel') {
    const { view } = layout
    return view.type === 'note' && view.kind === kind && view.selected ? view : undefined
  }
  for (const child of layout.children) {
    const found = selectedNote(child.node, kind)
    if (found !== undefined) return found
  }
  return undefined
}

function resolveNote(panel: NotePanel, focus: DayKey, rule: WeekRule): NoteView {
  const days = panel.kind === 'day' ? panel.offset : panel.offset * 7
  const target = addDays(focus, days)
  const key = panel.kind === 'day' ? target : weekStart(target, rule)
  return { type: 'note', kind: panel.kind, key, selected: panel.offset === 0 }
}

/** The least share of a split a node may have. */
export function minimumSize(node: Layout): number {
  return node.type === 'panel' && node.panel.type === 'weekStrip' ? MIN_STRIP_SIZE : MIN_PANE_SIZE
}

/** Normalizes sizes to fractions of 1, raising any pane below its minimum to that minimum. */
function clampFractions(sizes: number[], minimums: number[]): number[] {
  const least = (i: number) => minimums[i] ?? MIN_PANE_SIZE
  if (minimums.reduce((a, b) => a + b, 0) >= 1) return sizes.map(() => 1 / sizes.length)

  const clamped = new Set<number>()
  for (;;) {
    const free = sizes.reduce((sum, s, i) => (clamped.has(i) ? sum : sum + Math.max(s, 0)), 0)
    const remaining = 1 - [...clamped].reduce((sum, i) => sum + least(i), 0)
    const fractions = sizes.map((s, i) =>
      clamped.has(i)
        ? least(i)
        : free > 0
          ? (Math.max(s, 0) / free) * remaining
          : remaining / (sizes.length - clamped.size),
    )
    const tooSmall = fractions.findIndex((f, i) => !clamped.has(i) && f < least(i))
    if (tooSmall === -1) return fractions
    clamped.add(tooSmall)
  }
}

function collectSplitIds(layout: Layout): string[] {
  if (layout.type === 'panel') return []
  return [layout.id, ...layout.children.flatMap((child) => collectSplitIds(child.node))]
}
