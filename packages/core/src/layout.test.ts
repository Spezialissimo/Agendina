import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ISO_WEEK, US_WEEK, isDayKey } from './calendar.ts'
import {
  MIN_PANE_SIZE,
  OPEN_PLANNER,
  resolveLayout,
  setSplitSizes,
  type Layout,
  type ResolvedLayout,
} from './layout.ts'

const note = (id: string, kind: 'day' | 'week', offset: number): Layout => ({
  type: 'panel',
  id,
  panel: { type: 'note', kind, offset },
})

const row = (id: string, ...children: [Layout, number][]): Layout => ({
  type: 'split',
  id,
  direction: 'row',
  children: children.map(([node, size]) => ({ node, size })),
})

describe('OPEN_PLANNER', () => {
  it('shows the focused week on the left and the focused day on the right, both editable', () => {
    expect(resolveLayout(OPEN_PLANNER, '2026-10-24', ISO_WEEK)).toEqual({
      type: 'split',
      id: 'pages',
      direction: 'row',
      children: [
        {
          size: 0.45,
          node: {
            type: 'panel',
            id: 'week',
            view: { type: 'note', kind: 'week', key: '2026-10-19', editable: true },
          },
        },
        {
          size: 0.55,
          node: {
            type: 'panel',
            id: 'day',
            view: { type: 'note', kind: 'day', key: '2026-10-24', editable: true },
          },
        },
      ],
    } satisfies ResolvedLayout)
  })
})

describe('resolveLayout', () => {
  it('makes neighbour days read-only, and clicking them focuses that day', () => {
    const layout = row('r', [note('yesterday', 'day', -1), 1], [note('tomorrow', 'day', 1), 1])

    expect(resolveLayout(layout, '2026-10-19', ISO_WEEK)).toMatchObject({
      children: [
        {
          node: {
            view: { kind: 'day', key: '2026-10-18', editable: false, focusOnClick: '2026-10-18' },
          },
        },
        {
          node: {
            view: { kind: 'day', key: '2026-10-20', editable: false, focusOnClick: '2026-10-20' },
          },
        },
      ],
    })
  })

  it('keys week notes by the first day of the week, following the week rule', () => {
    const layout = row('r', [note('week', 'week', 0), 1])

    expect(resolveLayout(layout, '2026-10-24', ISO_WEEK)).toMatchObject({
      children: [{ node: { view: { key: '2026-10-19' } } }],
    })
    expect(resolveLayout(layout, '2026-10-24', US_WEEK)).toMatchObject({
      children: [{ node: { view: { key: '2026-10-18' } } }],
    })
  })

  it('moves the focus by whole weeks when a neighbour week is clicked', () => {
    const layout = row('r', [note('next', 'week', 1), 1])

    expect(resolveLayout(layout, '2026-12-30', ISO_WEEK)).toMatchObject({
      children: [
        { node: { view: { key: '2027-01-04', editable: false, focusOnClick: '2027-01-06' } } },
      ],
    })
  })

  it('resolves nested splits and keeps their structure', () => {
    const layout: Layout = row('outer', [
      {
        type: 'split',
        id: 'inner',
        direction: 'column',
        children: [{ node: note('a', 'day', 0), size: 2 }],
      },
      1,
    ])

    expect(resolveLayout(layout, '2026-10-24', ISO_WEEK)).toEqual({
      type: 'split',
      id: 'outer',
      direction: 'row',
      children: [
        {
          size: 1,
          node: {
            type: 'split',
            id: 'inner',
            direction: 'column',
            children: [
              {
                size: 2,
                node: {
                  type: 'panel',
                  id: 'a',
                  view: { type: 'note', kind: 'day', key: '2026-10-24', editable: true },
                },
              },
            ],
          },
        },
      ],
    })
  })

  it('always produces valid note keys, and only offset 0 is editable', () => {
    const anyDay = fc
      .date({
        min: new Date(Date.UTC(1950, 0, 1)),
        max: new Date(Date.UTC(2150, 11, 31)),
        noInvalidDate: true,
      })
      .map((d) => d.toISOString().slice(0, 10))

    fc.assert(
      fc.property(
        anyDay,
        fc.constantFrom('day' as const, 'week' as const),
        fc.integer({ min: -60, max: 60 }),
        (day, kind, offset) => {
          const resolved = resolveLayout(row('r', [note('p', kind, offset), 1]), day, ISO_WEEK)
          const view =
            resolved.type === 'split' && resolved.children[0]?.node.type === 'panel'
              ? resolved.children[0].node.view
              : undefined

          expect(view !== undefined && isDayKey(view.key)).toBe(true)
          expect(view?.editable).toBe(offset === 0)
        },
      ),
    )
  })
})

describe('setSplitSizes', () => {
  it('stores the new sizes as fractions of the split', () => {
    const updated = setSplitSizes(OPEN_PLANNER, 'pages', [3, 1])

    expect(updated).toMatchObject({ children: [{ size: 0.75 }, { size: 0.25 }] })
  })

  it('never lets a pane shrink below the minimum size', () => {
    const updated = setSplitSizes(OPEN_PLANNER, 'pages', [0.99, 0.01])

    expect(updated).toMatchObject({
      children: [{ size: 1 - MIN_PANE_SIZE }, { size: MIN_PANE_SIZE }],
    })
  })

  it('always produces fractions that add up to 1, each at least the minimum', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), { minLength: 1, maxLength: 6 }),
        (sizes) => {
          const layout = row(
            'r',
            ...sizes.map((_, i): [Layout, number] => [note(`p${i}`, 'day', i), 1]),
          )

          const updated = setSplitSizes(layout, 'r', sizes)
          const fractions = updated.type === 'split' ? updated.children.map((c) => c.size) : []

          expect(fractions.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
          const minimum = Math.min(MIN_PANE_SIZE, 1 / sizes.length)
          for (const f of fractions) expect(f).toBeGreaterThanOrEqual(minimum - 1e-9)
        },
      ),
      { numRuns: 1000 },
    )
  })

  it('updates nested splits without changing the original layout', () => {
    const original = row('outer', [
      {
        type: 'split',
        id: 'inner',
        direction: 'column',
        children: [
          { node: note('a', 'day', 0), size: 1 },
          { node: note('b', 'day', 1), size: 1 },
        ],
      },
      1,
    ])
    const snapshot = structuredClone(original)

    const updated = setSplitSizes(original, 'inner', [1, 3])

    expect(updated).toMatchObject({
      children: [{ node: { children: [{ size: 0.25 }, { size: 0.75 }] } }],
    })
    expect(original).toEqual(snapshot)
  })

  it('rejects an unknown split or the wrong number of sizes', () => {
    expect(() => setSplitSizes(OPEN_PLANNER, 'nope', [1, 1])).toThrow(/split "nope"/)
    expect(() => setSplitSizes(OPEN_PLANNER, 'pages', [1, 1, 1])).toThrow(/2 sizes/)
  })
})
