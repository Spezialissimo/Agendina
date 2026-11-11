import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ISO_WEEK, US_WEEK } from './calendar.ts'
import { MIN_PANE_SIZE, OPEN_PLANNER, resolveLayout, type Layout } from './layout.ts'
import {
  MAX_PANELS,
  addPanel,
  layoutProblems,
  movePanel,
  panelsOf,
  removePanel,
  setPanelContent,
  setSplitDirection,
  shiftPanel,
} from './layoutEdit.ts'

const note = (id: string, kind: 'day' | 'week', offset: number): Layout => ({
  type: 'panel',
  id,
  panel: { type: 'note', kind, offset },
})

const split = (
  id: string,
  direction: 'row' | 'column',
  ...children: [Layout, number][]
): Layout => ({
  type: 'split',
  id,
  direction,
  children: children.map(([node, size]) => ({ node, size })),
})

/** The pages a layout shows, in reading order, e.g. `['week 0', 'day 0']`. */
const pages = (layout: Layout) =>
  panelsOf(layout).map(({ panel }) =>
    panel.type === 'note' ? `${panel.kind} ${String(panel.offset)}` : panel.type,
  )

const calendar = (id: string): Layout => ({ type: 'panel', id, panel: { type: 'calendar' } })
const strip = (id: string): Layout => ({ type: 'panel', id, panel: { type: 'weekStrip' } })

/** Open planner before the week strip became a panel: the week page, then the day page. */
const WEEK_AND_DAY = split(
  'pages',
  'row',
  [note('week', 'week', 0), 0.45],
  [note('day', 'day', 0), 0.55],
)

const idsOf = (layout: Layout): string[] =>
  layout.type === 'panel'
    ? [layout.id]
    : [layout.id, ...layout.children.flatMap((c) => idsOf(c.node))]

const splitsOf = (layout: Layout): Extract<Layout, { type: 'split' }>[] =>
  layout.type === 'panel' ? [] : [layout, ...layout.children.flatMap((c) => splitsOf(c.node))]

describe('layoutProblems', () => {
  it('finds nothing wrong with the default layout', () => {
    expect(layoutProblems(OPEN_PLANNER)).toEqual([])
  })

  it.each([
    ['only a day page', note('d', 'day', 0)],
    ['only a week page', note('w', 'week', 0)],
    [
      'neighbour days next to the focused day',
      split(
        'r',
        'row',
        [note('a', 'day', -1), 1],
        [note('b', 'day', 0), 1],
        [note('c', 'day', 1), 1],
      ),
    ],
  ])('accepts %s', (_, layout) => {
    expect(layoutProblems(layout)).toEqual([])
  })

  it('accepts a calendar next to a page to write in', () => {
    expect(layoutProblems(split('r', 'row', [calendar('c'), 1], [note('d', 'day', 0), 1]))).toEqual(
      [],
    )
  })

  it('does not take a calendar for a page to write in, and shows it once', () => {
    expect(layoutProblems(calendar('c'))).toEqual(['no-editable-page'])
    expect(
      layoutProblems(
        split('r', 'row', [calendar('a'), 1], [calendar('b'), 1], [note('d', 'day', 0), 1]),
      ),
    ).toEqual(['duplicate-page'])
  })

  it('does not take the week strip for a page to write in, and shows it once', () => {
    expect(layoutProblems(strip('s'))).toEqual(['no-editable-page'])
    expect(layoutProblems(split('c', 'column', [strip('s'), 1], [note('d', 'day', 0), 1]))).toEqual(
      [],
    )
    expect(
      layoutProblems(
        split('c', 'column', [strip('a'), 1], [note('d', 'day', 0), 1], [strip('b'), 1]),
      ),
    ).toEqual(['duplicate-page'])
  })

  it('needs a page that can be written in', () => {
    const layout = split('r', 'row', [note('a', 'day', -1), 1], [note('b', 'week', 1), 1])

    expect(layoutProblems(layout)).toEqual(['no-editable-page'])
  })

  it.each([
    ['the focused day', 'day', 0],
    ['the focused week', 'week', 0],
    ['a neighbour day', 'day', -1],
  ] as const)('does not show %s twice', (_, kind, offset) => {
    const layout = split(
      'r',
      'row',
      [note('a', kind, offset), 1],
      [note('b', kind, offset), 1],
      [note('c', 'day', kind === 'day' && offset === 0 ? 1 : 0), 1],
    )

    expect(layoutProblems(layout)).toEqual(['duplicate-page'])
  })

  it(`allows at most ${String(MAX_PANELS)} pages`, () => {
    const days = (count: number) =>
      split(
        'r',
        'row',
        ...Array.from({ length: count }, (_, i): [Layout, number] => [
          note(`d${String(i)}`, 'day', i),
          1,
        ]),
      )

    expect(layoutProblems(days(MAX_PANELS))).toEqual([])
    expect(layoutProblems(days(MAX_PANELS + 1))).toEqual(['too-many-panels'])
  })
})

describe('setSplitDirection', () => {
  it('stacks pages that were side by side, keeping their sizes', () => {
    const stacked = setSplitDirection(WEEK_AND_DAY, 'pages', 'column')

    expect(stacked).toEqual({ ...WEEK_AND_DAY, direction: 'column' })
  })

  it('changes a nested split only', () => {
    const layout = split(
      'outer',
      'row',
      [note('w', 'week', 0), 1],
      [split('inner', 'column', [note('d', 'day', 0), 1], [note('n', 'day', 1), 1]), 1],
    )

    const changed = setSplitDirection(layout, 'inner', 'row')

    expect(splitsOf(changed).map((s) => [s.id, s.direction])).toEqual([
      ['outer', 'row'],
      ['inner', 'row'],
    ])
  })

  it('refuses a split that does not exist', () => {
    expect(() => setSplitDirection(WEEK_AND_DAY, 'nope', 'column')).toThrow(/no split "nope"/)
  })
})

describe('setPanelContent', () => {
  it('shows another page in the panel, keeping its place and size', () => {
    const changed = setPanelContent(WEEK_AND_DAY, 'week', { kind: 'day', offset: -1 })

    expect(pages(changed)).toEqual(['day -1', 'day 0'])
    expect(changed).toMatchObject({ children: [{ size: 0.45 }, { size: 0.55 }] })
    expect(idsOf(changed)).toEqual(idsOf(WEEK_AND_DAY))
  })

  it('shows the calendar in the panel, and a page again', () => {
    const withCalendar = setPanelContent(WEEK_AND_DAY, 'week', { kind: 'calendar' })

    expect(panelsOf(withCalendar)[0]).toEqual({
      type: 'panel',
      id: 'week',
      panel: { type: 'calendar' },
    })
    expect(pages(withCalendar)).toEqual(['calendar', 'day 0'])
    expect(setPanelContent(withCalendar, 'week', { kind: 'week', offset: 0 })).toEqual(WEEK_AND_DAY)
  })

  it('shows the week strip in the panel', () => {
    const withStrip = setPanelContent(WEEK_AND_DAY, 'week', { kind: 'weekStrip' })

    expect(panelsOf(withStrip)[0]).toEqual({
      type: 'panel',
      id: 'week',
      panel: { type: 'weekStrip' },
    })
    expect(pages(withStrip)).toEqual(['weekStrip', 'day 0'])
  })

  it('refuses a panel that does not exist', () => {
    expect(() => setPanelContent(WEEK_AND_DAY, 'nope', { kind: 'day', offset: 1 })).toThrow(
      /no panel "nope"/,
    )
  })
})

describe('addPanel', () => {
  it('adds a page after the given one in a split of the same direction, sharing its space', () => {
    const added = addPanel(WEEK_AND_DAY, 'week', 'right')

    expect(pages(added)).toEqual(['week 0', 'day 1', 'day 0'])
    expect(added).toMatchObject({
      type: 'split',
      id: 'pages',
      direction: 'row',
      children: [{ size: 0.225 }, { size: 0.225 }, { size: 0.55 }],
    })
  })

  it('splits the page itself when the new one goes the other way', () => {
    const added = addPanel(WEEK_AND_DAY, 'day', 'bottom')

    expect(added).toMatchObject({
      id: 'pages',
      direction: 'row',
      children: [
        { size: 0.45, node: { id: 'week' } },
        {
          size: 0.55,
          node: {
            type: 'split',
            direction: 'column',
            children: [
              { size: 0.5, node: { id: 'day' } },
              { size: 0.5, node: { type: 'panel', panel: { kind: 'day', offset: 1 } } },
            ],
          },
        },
      ],
    })
  })

  it('turns a single page into a split', () => {
    const added = addPanel(note('d', 'day', 0), 'd', 'right')

    expect(added).toMatchObject({ type: 'split', direction: 'row' })
    expect(pages(added)).toEqual(['day 0', 'week 0'])
  })

  it('first adds the page that can be written in and is missing, then the nearest free days', () => {
    let layout: Layout = note('w', 'week', 0)
    const shown: string[] = []
    for (let i = 0; i < 4; i++) {
      const before = pages(layout)
      layout = addPanel(layout, 'w', 'right')
      shown.push(...pages(layout).filter((p) => !before.includes(p)))
    }

    expect(shown).toEqual(['day 0', 'day 1', 'day -1', 'day 2'])
  })

  it('never adds a calendar by itself, and counts around one', () => {
    const layout = split('r', 'row', [calendar('c'), 0.5], [note('d', 'day', 0), 0.5])

    expect(pages(addPanel(layout, 'c', 'right'))).toEqual(['calendar', 'week 0', 'day 0'])
  })

  it('never adds a week strip by itself', () => {
    const layout = split('c', 'column', [strip('s'), 1], [note('d', 'day', 0), 1])

    expect(pages(addPanel(layout, 's', 'bottom'))).toEqual(['weekStrip', 'week 0', 'day 0'])
  })

  it('keeps every page at least the minimum size', () => {
    const layout = split('r', 'row', [note('w', 'week', 0), 0.2], [note('d', 'day', 0), 0.8])

    const added = addPanel(layout, 'w', 'right')

    expect(splitsOf(added)[0]?.children.map((c) => c.size)).toEqual([
      MIN_PANE_SIZE,
      MIN_PANE_SIZE,
      1 - 2 * MIN_PANE_SIZE,
    ])
  })

  it('refuses a panel that does not exist', () => {
    expect(() => addPanel(WEEK_AND_DAY, 'nope', 'right')).toThrow(/no panel "nope"/)
  })
})

describe('removePanel', () => {
  it('gives the space of the removed page to the others, in proportion', () => {
    const layout = split(
      'r',
      'row',
      [note('w', 'week', 0), 0.5],
      [note('d', 'day', 0), 0.3],
      [note('n', 'day', 1), 0.2],
    )

    const removed = removePanel(layout, 'w')

    expect(pages(removed)).toEqual(['day 0', 'day 1'])
    expect(splitsOf(removed)[0]?.children.map((c) => c.size)).toEqual([0.6, 0.4])
  })

  it('leaves the last page alone on the screen, without a split around it', () => {
    expect(removePanel(WEEK_AND_DAY, 'week')).toEqual(note('day', 'day', 0))
  })

  it('replaces a nested split left with one page by that page, at the split’s size', () => {
    const layout = split(
      'outer',
      'row',
      [note('w', 'week', 0), 0.4],
      [split('inner', 'column', [note('d', 'day', 0), 0.5], [note('n', 'day', 1), 0.5]), 0.6],
    )

    expect(removePanel(layout, 'n')).toEqual(
      split('outer', 'row', [note('w', 'week', 0), 0.4], [note('d', 'day', 0), 0.6]),
    )
  })

  it('undoes adding a page', () => {
    const added = addPanel(WEEK_AND_DAY, 'day', 'bottom')
    const newPanel = panelsOf(added).find((p) => !idsOf(WEEK_AND_DAY).includes(p.id))

    expect(removePanel(added, newPanel?.id ?? '')).toEqual(WEEK_AND_DAY)
  })

  it('refuses to remove the only page', () => {
    expect(() => removePanel(note('d', 'day', 0), 'd')).toThrow(/only page/)
  })

  it('refuses a panel that does not exist', () => {
    expect(() => removePanel(WEEK_AND_DAY, 'nope')).toThrow(/no panel "nope"/)
  })
})

describe('movePanel', () => {
  it('swaps two pages side by side', () => {
    const moved = movePanel(WEEK_AND_DAY, 'week', 'day', 'right')

    expect(moved).toMatchObject({
      type: 'split',
      direction: 'row',
      children: [{ node: { id: 'day' } }, { node: { id: 'week' } }],
    })
    expect(pages(moved)).toEqual(['day 0', 'week 0'])
  })

  it('stacks two pages that were side by side', () => {
    const moved = movePanel(WEEK_AND_DAY, 'week', 'day', 'top')

    expect(moved).toMatchObject({
      type: 'split',
      direction: 'column',
      children: [
        { size: 0.5, node: { id: 'week' } },
        { size: 0.5, node: { id: 'day' } },
      ],
    })
  })

  it.each([
    ['left', ['n', 'w', 'd']],
    ['right', ['w', 'n', 'd']],
  ] as const)('puts a page %s of another in the same row, sharing its space', (side, order) => {
    const layout = split(
      'r',
      'row',
      [note('w', 'week', 0), 0.4],
      [note('d', 'day', 0), 0.3],
      [note('n', 'day', 1), 0.3],
    )

    const moved = movePanel(layout, 'n', 'w', side)

    expect(panelsOf(moved).map((p) => p.id)).toEqual(order)
    expect(splitsOf(moved)).toHaveLength(1)
    const sizes = Object.fromEntries(
      splitsOf(moved)[0]?.children.map((c) => [c.node.id, c.size]) ?? [],
    )
    // The week kept 4/7 of the row when the day after left, and shares that with it now.
    expect(sizes.w).toBeCloseTo(2 / 7)
    expect(sizes.n).toBeCloseTo(2 / 7)
    expect(sizes.d).toBeCloseTo(3 / 7)
  })

  it('puts a page below another, splitting that one only', () => {
    const layout = split(
      'r',
      'row',
      [note('w', 'week', 0), 0.4],
      [note('d', 'day', 0), 0.3],
      [note('n', 'day', 1), 0.3],
    )

    const moved = movePanel(layout, 'n', 'd', 'bottom')

    expect(moved).toMatchObject({
      id: 'r',
      direction: 'row',
      children: [
        { node: { id: 'w' } },
        {
          node: {
            type: 'split',
            direction: 'column',
            children: [{ node: { id: 'd' } }, { node: { id: 'n' } }],
          },
        },
      ],
    })
  })

  it('keeps the page as it was: its id and what it shows', () => {
    const moved = movePanel(WEEK_AND_DAY, 'week', 'day', 'bottom')

    expect(panelsOf(moved)).toEqual([...panelsOf(WEEK_AND_DAY)].reverse())
  })

  it('refuses to move a page next to itself, or pages that do not exist', () => {
    expect(() => movePanel(WEEK_AND_DAY, 'day', 'day', 'left')).toThrow(/next to itself/)
    expect(() => movePanel(WEEK_AND_DAY, 'nope', 'day', 'left')).toThrow(/no panel "nope"/)
    expect(() => movePanel(WEEK_AND_DAY, 'day', 'nope', 'left')).toThrow(/no panel "nope"/)
  })
})

describe('addPanel on the other sides', () => {
  it('adds a page before the given one: on its left, or above it', () => {
    expect(pages(addPanel(WEEK_AND_DAY, 'day', 'left'))).toEqual(['week 0', 'day 1', 'day 0'])

    const above = addPanel(WEEK_AND_DAY, 'day', 'top')
    expect(above).toMatchObject({
      direction: 'row',
      children: [
        { node: { id: 'week' } },
        {
          size: 0.55,
          node: {
            direction: 'column',
            children: [{ node: { panel: { kind: 'day', offset: 1 } } }, { node: { id: 'day' } }],
          },
        },
      ],
    })
  })
})

describe('shiftPanel', () => {
  const nested = () =>
    split(
      'outer',
      'row',
      [note('w', 'week', 0), 0.4],
      [split('inner', 'column', [note('d', 'day', 0), 0.5], [note('n', 'day', 1), 0.5]), 0.6],
    )
  const order = (layout: Layout) => panelsOf(layout).map((p) => p.id)

  it('swaps a page with its neighbour in that direction, each keeping its size', () => {
    expect(shiftPanel(WEEK_AND_DAY, 'week', 'right')).toEqual(
      split('pages', 'row', [note('day', 'day', 0), 0.55], [note('week', 'week', 0), 0.45]),
    )
    expect(order(shiftPanel(nested(), 'd', 'bottom'))).toEqual(['w', 'n', 'd'])
  })

  it('swaps a page wrapped alone in a group (from the API) like the page itself', () => {
    const wrapped = split(
      'outer',
      'row',
      [note('w', 'week', 0), 0.4],
      [split('alone', 'column', [note('d', 'day', 0), 1]), 0.6],
    )

    expect(order(shiftPanel(wrapped, 'd', 'left'))).toEqual(['d', 'w'])
  })

  it('swaps with a whole group of pages when that is the neighbour', () => {
    const moved = shiftPanel(nested(), 'w', 'right')

    expect(moved).toMatchObject({
      id: 'outer',
      children: [
        { size: 0.6, node: { id: 'inner' } },
        { size: 0.4, node: { id: 'w' } },
      ],
    })
  })

  it('leaves its group to stand between it and the neighbour', () => {
    const moved = shiftPanel(nested(), 'n', 'left')

    // The day below came out of its column: week, then it, then the day, all side by side.
    expect(moved).toMatchObject({
      type: 'split',
      id: 'outer',
      direction: 'row',
      children: [
        { size: 0.4, node: { id: 'w' } },
        { size: 0.3, node: { id: 'n' } },
        { size: 0.3, node: { id: 'd' } },
      ],
    })
  })

  it('goes to the edge of the screen when nothing is in the way', () => {
    // Up from a row: across the whole top.
    expect(shiftPanel(WEEK_AND_DAY, 'day', 'top')).toMatchObject({
      type: 'split',
      direction: 'column',
      children: [
        { size: 0.5, node: { id: 'day' } },
        { size: 0.5, node: { id: 'week' } },
      ],
    })

    // Right from inside the last column: a column of its own at the right edge.
    const moved = shiftPanel(nested(), 'd', 'right')
    expect(order(moved)).toEqual(['w', 'n', 'd'])
    expect(splitsOf(moved)).toHaveLength(1)
    const sizes = splitsOf(moved)[0]?.children.map((c) => c.size) ?? []
    expect(sizes[2]).toBeCloseTo(1 / 3)
    expect((sizes[0] ?? 0) / (sizes[1] ?? 1)).toBeCloseTo(0.4 / 0.6)
  })

  it('refuses when the page is already at that edge', () => {
    expect(() => shiftPanel(WEEK_AND_DAY, 'day', 'right')).toThrow(/further/)
    expect(() => shiftPanel(WEEK_AND_DAY, 'week', 'left')).toThrow(/further/)
    expect(() => shiftPanel(note('d', 'day', 0), 'd', 'top')).toThrow(/further/)
    expect(() => shiftPanel(WEEK_AND_DAY, 'nope', 'top')).toThrow(/no panel "nope"/)
  })
})

describe('editing a layout', () => {
  type Step =
    | { op: 'add'; panel: number; side: 'left' | 'right' | 'top' | 'bottom' }
    | { op: 'shift'; panel: number; side: 'left' | 'right' | 'top' | 'bottom' }
    | { op: 'remove'; panel: number }
    | { op: 'content'; panel: number; kind: 'day' | 'week'; offset: number }
    | { op: 'calendar'; panel: number }
    | { op: 'direction'; split: number; direction: 'row' | 'column' }
    | { op: 'move'; panel: number; target: number; side: 'left' | 'right' | 'top' | 'bottom' }

  const direction = fc.constantFrom('row' as const, 'column' as const)
  const side = fc.constantFrom('left' as const, 'right' as const, 'top' as const, 'bottom' as const)
  const step: fc.Arbitrary<Step> = fc.oneof(
    fc.record({ op: fc.constant('add' as const), panel: fc.nat(), side }),
    fc.record({ op: fc.constant('shift' as const), panel: fc.nat(), side }),
    fc.record({ op: fc.constant('remove' as const), panel: fc.nat() }),
    fc.record({
      op: fc.constant('content' as const),
      panel: fc.nat(),
      kind: fc.constantFrom('day' as const, 'week' as const),
      offset: fc.integer({ min: -3, max: 3 }),
    }),
    fc.record({ op: fc.constant('direction' as const), split: fc.nat(), direction }),
    fc.record({ op: fc.constant('calendar' as const), panel: fc.nat() }),
    fc.record({
      op: fc.constant('move' as const),
      panel: fc.nat(),
      target: fc.nat(),
      side: fc.constantFrom('left' as const, 'right' as const, 'top' as const, 'bottom' as const),
    }),
  )

  /** Applies a step the way the editor does: a change that would break the layout is not offered. */
  const apply = (layout: Layout, s: Step): Layout => {
    const panels = panelsOf(layout)
    const panel = panels[('panel' in s ? s.panel : 0) % panels.length]?.id ?? ''
    let next = layout
    if (s.op === 'add') next = addPanel(layout, panel, s.side)
    if (s.op === 'shift') {
      try {
        next = shiftPanel(layout, panel, s.side)
      } catch {
        // Already at that edge.
      }
      expect(pages(next).sort()).toEqual(pages(layout).sort())
    }
    if (s.op === 'remove' && panels.length > 1) next = removePanel(layout, panel)
    if (s.op === 'content') next = setPanelContent(layout, panel, s)
    if (s.op === 'calendar') next = setPanelContent(layout, panel, { kind: 'calendar' })
    if (s.op === 'move') {
      const target = panels[s.target % panels.length]?.id ?? ''
      if (target !== panel) {
        next = movePanel(layout, panel, target, s.side)
        // Moving never changes which pages are shown.
        expect(pages(next).sort()).toEqual(pages(layout).sort())
      }
    }
    if (s.op === 'direction') {
      const splits = splitsOf(layout)
      const target = splits[s.split % Math.max(splits.length, 1)]
      if (target !== undefined) next = setSplitDirection(layout, target.id, s.direction)
    }
    return layoutProblems(next).length === 0 ? next : layout
  }

  it('always leaves a layout that is valid, well-formed and shows on any day', () => {
    fc.assert(
      fc.property(
        fc.array(step, { maxLength: 30 }),
        fc.date({ min: new Date('1990-01-01'), max: new Date('2100-01-01'), noInvalidDate: true }),
        fc.constantFrom(ISO_WEEK, US_WEEK),
        (steps, date, rule) => {
          const layout = steps.reduce(apply, WEEK_AND_DAY)

          expect(layoutProblems(layout)).toEqual([])
          const ids = idsOf(layout)
          expect(new Set(ids).size).toBe(ids.length)
          for (const s of splitsOf(layout)) {
            // No split is left with a single page after an edit.
            expect(s.children.length).toBeGreaterThan(1)
            const sizes = s.children.map((c) => c.size)
            expect(sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
            for (const size of sizes) expect(size).toBeGreaterThanOrEqual(MIN_PANE_SIZE - 1e-9)
          }
          const day = date.toISOString().slice(0, 10)
          expect(() => resolveLayout(layout, day, rule)).not.toThrow()
        },
      ),
    )
  })
})
