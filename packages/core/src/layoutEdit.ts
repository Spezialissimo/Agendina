import {
  MIN_PANE_SIZE,
  setSplitSizes,
  type Layout,
  type NotePanel,
  type Panel,
  type PanelNode,
  type SplitNode,
} from './layout.ts'

/** As many as fit in one split with every page at least `MIN_PANE_SIZE` wide. */
export const MAX_PANELS = 6

export type LayoutProblem = 'no-editable-page' | 'duplicate-page' | 'too-many-panels'

/** What a panel shows: a page (its kind and distance from the focused day) or the calendar. */
export type PanelContent = Pick<NotePanel, 'kind' | 'offset'> | { kind: 'calendar' }

export function panelContent(panel: Panel): PanelContent {
  return panel.type === 'calendar'
    ? { kind: 'calendar' }
    : { kind: panel.kind, offset: panel.offset }
}

/** The panels of a layout, in reading order. */
export function panelsOf(layout: Layout): PanelNode[] {
  return layout.type === 'panel' ? [layout] : layout.children.flatMap((c) => panelsOf(c.node))
}

/**
 * Why a layout cannot be used, if so. A layout needs a page to write in (offset 0), and shows
 * each page once: a note must never have two editors.
 */
export function layoutProblems(layout: Layout): LayoutProblem[] {
  const shown = panelsOf(layout).map(({ panel }) => contentKey(panelContent(panel)))
  const problems: LayoutProblem[] = []
  if (!shown.some((key) => key.endsWith(':0'))) problems.push('no-editable-page')
  if (new Set(shown).size !== shown.length) problems.push('duplicate-page')
  if (shown.length > MAX_PANELS) problems.push('too-many-panels')
  return problems
}

/** Returns a copy of `layout` where the split `splitId` lays its pages out in `direction`. */
export function setSplitDirection(
  layout: Layout,
  splitId: string,
  direction: SplitNode['direction'],
): Layout {
  if (!idsOf(layout, 'split').includes(splitId)) {
    throw new Error(`Layout has no split "${splitId}"`)
  }
  const update = (node: Layout): Layout => {
    if (node.type === 'panel') return node
    if (node.id === splitId) return { ...node, direction }
    return { ...node, children: node.children.map((c) => ({ ...c, node: update(c.node) })) }
  }
  return update(layout)
}

/** Returns a copy of `layout` where the panel `panelId` shows `content`. */
export function setPanelContent(layout: Layout, panelId: string, content: PanelContent): Layout {
  return replacePanel(layout, panelId, (panel) => ({
    ...panel,
    panel:
      content.kind === 'calendar'
        ? { type: 'calendar' }
        : { type: 'note', kind: content.kind, offset: content.offset },
  }))
}

/** A side of a page: where another page goes, or the way the page moves. */
export type PanelSide = 'left' | 'right' | 'top' | 'bottom'

const axisOf = (side: PanelSide): SplitNode['direction'] =>
  side === 'left' || side === 'right' ? 'row' : 'column'

const placeOf = (side: PanelSide) => (side === 'left' || side === 'top' ? 'before' : 'after')

/**
 * Returns a copy of `layout` with a new page on `side` of the panel `panelId`. The two share the
 * space the panel had. The new page shows the day or week to write in if the layout has none,
 * else the nearest day not shown yet.
 */
export function addPanel(layout: Layout, panelId: string, side: PanelSide): Layout {
  requirePanel(layout, panelId)
  const added: PanelNode = {
    type: 'panel',
    id: freeId(layout, 'panel'),
    panel: { type: 'note', ...freeContent(layout) },
  }
  return insertNextTo(layout, panelId, added, axisOf(side), placeOf(side))
}

/**
 * Returns a copy of `layout` where the panel `panelId` is one step further towards `side`:
 * - past its neighbour on that side (a page or a whole group), each keeping its size;
 * - or, when its group is in the way, out of the group, between it and the neighbour;
 * - or, with nothing on that side, across the whole edge of the screen.
 * Throws when the page is at that edge already.
 */
export function shiftPanel(layout: Layout, panelId: string, side: PanelSide): Layout {
  const moved = panelsOf(layout).find((p) => p.id === panelId)
  if (moved === undefined) throw new Error(`Layout has no panel "${panelId}"`)
  const axis = axisOf(side)
  const step = placeOf(side) === 'after' ? 1 : -1
  const path = pathTo(layout, panelId)

  // The nearest group laid out along the way that has something on that side.
  for (let depth = path.length - 1; depth >= 0; depth--) {
    const level = path[depth]
    if (level === undefined) break
    const { split, index } = level
    const neighbour = split.children[index + step]
    const self = split.children[index]
    if (split.direction !== axis || neighbour === undefined || self === undefined) continue
    // The page itself, or groups with nothing else in them (the API allows those).
    if (panelsOf(self.node).length === 1) {
      const children = [...split.children]
      children[index] = neighbour
      children[index + step] = self
      return replaceSplit(layout, split.id, { ...split, children })
    }
    // Its branch holds other pages too, so it stays when the page leaves.
    const rest = removePanel(layout, panelId)
    const group = splitsIn(rest).find((s) => s.id === split.id)
    const branch = group?.children[index]
    if (group === undefined || branch === undefined) {
      throw new Error(`Group "${split.id}" lost its branch when the page left it`)
    }
    const halves: SplitNode['children'] = [
      { node: branch.node, size: branch.size / 2 },
      { node: moved, size: branch.size / 2 },
    ]
    if (step < 0) halves.reverse()
    return replaceSplit(
      rest,
      group.id,
      withMinimumSizes({ ...group, children: group.children.toSpliced(index, 1, ...halves) }),
    )
  }

  // Nothing on that side. Unless every group on the way runs in that direction, the page is
  // not across the whole edge yet.
  if (path.every(({ split }) => split.direction === axis || split.children.length < 2)) {
    throw new Error('Cannot move the page further that way')
  }
  const rest = removePanel(layout, panelId)
  if (rest.type === 'split' && rest.direction === axis) {
    const share = 1 / (rest.children.length + 1)
    const others = rest.children.map((c) => ({ ...c, size: c.size * (1 - share) }))
    const edge = { node: moved, size: share }
    return withMinimumSizes({ ...rest, children: step > 0 ? [...others, edge] : [edge, ...others] })
  }
  return step > 0
    ? pair(freeId(rest, 'split'), axis, rest, moved)
    : pair(freeId(rest, 'split'), axis, moved, rest)
}

/**
 * Returns a copy of `layout` where the panel `panelId` sits on `side` of the panel `targetId`.
 * It leaves its old place as in `removePanel` and shares the target's space as in `addPanel`.
 */
export function movePanel(
  layout: Layout,
  panelId: string,
  targetId: string,
  side: PanelSide,
): Layout {
  const moved = panelsOf(layout).find((p) => p.id === panelId)
  if (moved === undefined) throw new Error(`Layout has no panel "${panelId}"`)
  requirePanel(layout, targetId)
  if (panelId === targetId) throw new Error('Cannot move a page next to itself')
  return insertNextTo(removePanel(layout, panelId), targetId, moved, axisOf(side), placeOf(side))
}

/**
 * Puts `added` before or after the panel `targetId`: as its neighbour in a split of the same
 * direction, else in a new split that takes the target's place. Either way the two share the
 * space the target had.
 */
function insertNextTo(
  layout: Layout,
  targetId: string,
  added: PanelNode,
  direction: SplitNode['direction'],
  place: 'before' | 'after',
): Layout {
  const inOrder = (target: Layout): [Layout, Layout] =>
    place === 'before' ? [added, target] : [target, added]
  if (layout.type === 'panel') {
    return pair(freeId(layout, 'split'), direction, ...inOrder(layout))
  }

  const update = (node: SplitNode): SplitNode => {
    const index = node.children.findIndex((c) => c.node.type === 'panel' && c.node.id === targetId)
    const target = node.children[index]
    if (target === undefined) {
      return {
        ...node,
        children: node.children.map((c) =>
          c.node.type === 'split' ? { ...c, node: update(c.node) } : c,
        ),
      }
    }
    if (node.direction !== direction) {
      const inner = pair(freeId(layout, 'split'), direction, ...inOrder(target.node))
      return { ...node, children: node.children.with(index, { ...target, node: inner }) }
    }
    const halves = inOrder(target.node).map((child) => ({ node: child, size: target.size / 2 }))
    return withMinimumSizes({ ...node, children: node.children.toSpliced(index, 1, ...halves) })
  }
  return update(layout)
}

/**
 * Returns a copy of `layout` without the panel `panelId`. Its space goes to its neighbours, and a
 * split left with one page is replaced by that page.
 */
export function removePanel(layout: Layout, panelId: string): Layout {
  requirePanel(layout, panelId)
  const remove = (node: Layout): Layout | undefined => {
    if (node.type === 'panel') return node.id === panelId ? undefined : node
    const children = node.children.flatMap((c) => {
      const kept = remove(c.node)
      return kept === undefined ? [] : [{ node: kept, size: c.size }]
    })
    if (children.length === node.children.length) return { ...node, children }
    const [only] = children
    if (only === undefined) return undefined
    if (children.length === 1) return only.node
    const total = children.reduce((sum, c) => sum + c.size, 0)
    return withMinimumSizes({
      ...node,
      children: children.map((c) => ({ ...c, size: c.size / total })),
    })
  }
  const remaining = remove(layout)
  if (remaining === undefined) throw new Error('Cannot remove the only page of a layout')
  return remaining
}

/** The groups from the top of the layout down to the panel, with the branch taken in each. */
function pathTo(layout: Layout, panelId: string): { split: SplitNode; index: number }[] {
  if (layout.type === 'panel') return []
  for (const [index, child] of layout.children.entries()) {
    if (panelsOf(child.node).some((p) => p.id === panelId)) {
      return [{ split: layout, index }, ...pathTo(child.node, panelId)]
    }
  }
  return []
}

function splitsIn(layout: Layout): SplitNode[] {
  return layout.type === 'panel'
    ? []
    : [layout, ...layout.children.flatMap((c) => splitsIn(c.node))]
}

function replaceSplit(layout: Layout, splitId: string, replacement: SplitNode): Layout {
  if (layout.type === 'panel') return layout
  if (layout.id === splitId) return replacement
  return {
    ...layout,
    children: layout.children.map((c) => ({
      ...c,
      node: replaceSplit(c.node, splitId, replacement),
    })),
  }
}

/** Names what a panel shows: two panels with the same key show the same page. */
export function contentKey(content: PanelContent): string {
  return content.kind === 'calendar' ? 'calendar' : `${content.kind}:${String(content.offset)}`
}

function replacePanel(
  layout: Layout,
  panelId: string,
  replace: (panel: PanelNode) => Layout,
): Layout {
  requirePanel(layout, panelId)
  const update = (node: Layout): Layout => {
    if (node.type === 'split') {
      return { ...node, children: node.children.map((c) => ({ ...c, node: update(c.node) })) }
    }
    return node.id === panelId ? replace(node) : node
  }
  return update(layout)
}

function requirePanel(layout: Layout, panelId: string): void {
  if (!panelsOf(layout).some((p) => p.id === panelId)) {
    throw new Error(`Layout has no panel "${panelId}"`)
  }
}

function pair(
  id: string,
  direction: SplitNode['direction'],
  first: Layout,
  second: Layout,
): SplitNode {
  return {
    type: 'split',
    id,
    direction,
    children: [
      { node: first, size: 0.5 },
      { node: second, size: 0.5 },
    ],
  }
}

/** Raises the pages of `split` that became too small; sizes that are fine stay as they are. */
function withMinimumSizes(split: SplitNode): SplitNode {
  const sizes = split.children.map((c) => c.size)
  if (sizes.every((size) => size >= MIN_PANE_SIZE)) return split
  return setSplitSizes(split, split.id, sizes) as SplitNode
}

/** The page a new panel shows: never the calendar, which is chosen on purpose. */
function freeContent(layout: Layout): Pick<NotePanel, 'kind' | 'offset'> {
  const shown = new Set(panelsOf(layout).map(({ panel }) => contentKey(panelContent(panel))))
  const free = (content: PanelContent) => !shown.has(contentKey(content))
  const editable: Pick<NotePanel, 'kind' | 'offset'>[] = [
    { kind: 'day', offset: 0 },
    { kind: 'week', offset: 0 },
  ]
  const missing = editable.find(free)
  if (missing !== undefined) return missing
  for (let distance = 1; ; distance++) {
    for (const offset of [distance, -distance]) {
      if (free({ kind: 'day', offset })) return { kind: 'day', offset }
    }
  }
}

function freeId(layout: Layout, prefix: 'panel' | 'split'): string {
  const used = new Set(idsOf(layout))
  for (let n = 1; ; n++) {
    const id = `${prefix}-${String(n)}`
    if (!used.has(id)) return id
  }
}

function idsOf(layout: Layout, only?: Layout['type']): string[] {
  const own = only === undefined || only === layout.type ? [layout.id] : []
  if (layout.type === 'panel') return own
  return [...own, ...layout.children.flatMap((c) => idsOf(c.node, only))]
}
