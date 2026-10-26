import { z } from 'zod'
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

export interface PanelNode {
  type: 'panel'
  id: string
  panel: NotePanel
}

export interface SplitNode {
  type: 'split'
  id: string
  direction: 'row' | 'column'
  /** Sizes are relative to their siblings. */
  children: { node: Layout; size: number }[]
}

/** The pages area below the week strip: a tree of splits whose leaves are panels. */
export type Layout = PanelNode | SplitNode

export interface NoteView {
  type: 'note'
  kind: 'day' | 'week'
  /** The note's key: the day, or the first day of the week. */
  key: DayKey
  editable: boolean
  /** For read-only neighbours: the day to focus when the panel is clicked. */
  focusOnClick?: DayKey
}

export type ResolvedLayout =
  | { type: 'panel'; id: string; view: NoteView }
  | {
      type: 'split'
      id: string
      direction: 'row' | 'column'
      children: { node: ResolvedLayout; size: number }[]
    }

export const MIN_PANE_SIZE = 0.15

/** The default layout: the week page on the left, the focused day on the right. */
export const OPEN_PLANNER: Layout = {
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
}

const NotePanelSchema = z.object({
  type: z.literal('note'),
  kind: z.enum(['day', 'week']),
  offset: z.number().int(),
})

const LayoutSchema: z.ZodType<Layout> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('panel'), id: z.string().min(1), panel: NotePanelSchema }),
    z.object({
      type: z.literal('split'),
      id: z.string().min(1),
      direction: z.enum(['row', 'column']),
      children: z.array(z.object({ node: LayoutSchema, size: z.number().positive() })).min(1),
    }),
  ]),
)

/** Validates a layout from untrusted JSON (e.g. user settings). Throws when it is invalid. */
export function parseLayout(value: unknown): Layout {
  const layout = LayoutSchema.parse(value)
  const ids = collectIds(layout)
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i)
  if (duplicate !== undefined) throw new Error(`Invalid layout: duplicate id "${duplicate}"`)
  return layout
}

export function resolveLayout(layout: Layout, focus: DayKey, rule: WeekRule): ResolvedLayout {
  if (layout.type === 'panel') {
    return { type: 'panel', id: layout.id, view: resolveNote(layout.panel, focus, rule) }
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
 * add up to 1 and are at least `MIN_PANE_SIZE` each.
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
    const fractions = clampFractions(sizes)
    return {
      ...node,
      children: node.children.map((child, i) => ({ ...child, size: fractions[i] as number })),
    }
  }
  return update(layout)
}

function resolveNote(panel: NotePanel, focus: DayKey, rule: WeekRule): NoteView {
  const days = panel.kind === 'day' ? panel.offset : panel.offset * 7
  const target = addDays(focus, days)
  const key = panel.kind === 'day' ? target : weekStart(target, rule)
  if (panel.offset === 0) return { type: 'note', kind: panel.kind, key, editable: true }
  return { type: 'note', kind: panel.kind, key, editable: false, focusOnClick: target }
}

/** Normalizes sizes to fractions of 1, raising any pane below the minimum to the minimum. */
function clampFractions(sizes: number[]): number[] {
  if (sizes.length * MIN_PANE_SIZE >= 1) return sizes.map(() => 1 / sizes.length)

  const clamped = new Set<number>()
  for (;;) {
    const free = sizes.reduce((sum, s, i) => (clamped.has(i) ? sum : sum + Math.max(s, 0)), 0)
    const remaining = 1 - clamped.size * MIN_PANE_SIZE
    const fractions = sizes.map((s, i) =>
      clamped.has(i)
        ? MIN_PANE_SIZE
        : free > 0
          ? (Math.max(s, 0) / free) * remaining
          : remaining / (sizes.length - clamped.size),
    )
    const tooSmall = fractions.findIndex((f, i) => !clamped.has(i) && f < MIN_PANE_SIZE)
    if (tooSmall === -1) return fractions
    clamped.add(tooSmall)
  }
}

function collectIds(layout: Layout): string[] {
  if (layout.type === 'panel') return [layout.id]
  return [layout.id, ...layout.children.flatMap((child) => collectIds(child.node))]
}

function collectSplitIds(layout: Layout): string[] {
  if (layout.type === 'panel') return []
  return [layout.id, ...layout.children.flatMap((child) => collectSplitIds(child.node))]
}
