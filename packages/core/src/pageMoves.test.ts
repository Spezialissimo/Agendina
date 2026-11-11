import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ISO_WEEK, addDays } from './calendar.ts'
import { OPEN_PLANNER, resolveLayout, type Layout, type ResolvedLayout } from './layout.ts'
import { pageInDirection, type Direction } from './pageMoves.ts'

const FOCUS = '2026-10-28'

const note = (id: string, kind: 'day' | 'week', offset: number): Layout => ({
  type: 'panel',
  id,
  panel: { type: 'note', kind, offset },
})
const calendar = (id: string): Layout => ({ type: 'panel', id, panel: { type: 'calendar' } })
const split =
  (direction: 'row' | 'column') =>
  (id: string, ...children: [Layout, number][]): Layout => ({
    type: 'split',
    id,
    direction,
    children: children.map(([node, size]) => ({ node, size })),
  })
const row = split('row')
const column = split('column')

const resolved = (layout: Layout): ResolvedLayout => resolveLayout(layout, FOCUS, ISO_WEEK)

const WEEK = { kind: 'week', key: '2026-10-26' } as const
const TODAY = { kind: 'day', key: '2026-10-28' } as const
const YESTERDAY = { kind: 'day', key: '2026-10-27' } as const
const TOMORROW = { kind: 'day', key: '2026-10-29' } as const

/** The page reached from `from`, as kind and key. */
const move = (layout: Layout, from: { kind: 'day' | 'week'; key: string }, to: Direction) => {
  const found = pageInDirection(resolved(layout), from, to)
  return found === undefined ? undefined : { kind: found.kind, key: found.key }
}

describe('pageInDirection', () => {
  it('moves between the week and the day of Open planner', () => {
    expect(move(OPEN_PLANNER, WEEK, 'right')).toEqual(TODAY)
    expect(move(OPEN_PLANNER, TODAY, 'left')).toEqual(WEEK)
  })

  it('finds nothing past the edge of the layout', () => {
    expect(move(OPEN_PLANNER, WEEK, 'left')).toBeUndefined()
    expect(move(OPEN_PLANNER, TODAY, 'right')).toBeUndefined()
    expect(move(OPEN_PLANNER, TODAY, 'up')).toBeUndefined()
    expect(move(OPEN_PLANNER, TODAY, 'down')).toBeUndefined()
  })

  it('moves up and down in a column', () => {
    const layout = column('pages', [note('week', 'week', 0), 0.4], [note('day', 'day', 0), 0.6])
    expect(move(layout, WEEK, 'down')).toEqual(TODAY)
    expect(move(layout, TODAY, 'up')).toEqual(WEEK)
    expect(move(layout, WEEK, 'right')).toBeUndefined()
  })

  it('goes to the nearest page on that side', () => {
    const layout = row(
      'pages',
      [note('yesterday', 'day', -1), 1],
      [note('today', 'day', 0), 1],
      [note('tomorrow', 'day', 1), 1],
    )
    expect(move(layout, YESTERDAY, 'right')).toEqual(TODAY)
    expect(move(layout, TOMORROW, 'left')).toEqual(TODAY)
  })

  it('skips panels without a page to write in, such as the calendar', () => {
    const layout = row(
      'pages',
      [note('week', 'week', 0), 1],
      [calendar('calendar'), 1],
      [note('day', 'day', 0), 1],
    )
    expect(move(layout, WEEK, 'right')).toEqual(TODAY)
    expect(move(layout, TODAY, 'left')).toEqual(WEEK)
  })

  it('only goes to pages level with the one it starts from', () => {
    // The week fills the top left; nothing is to the right of it, as the day is below its row.
    const layout = column(
      'pages',
      [row('top', [note('week', 'week', 0), 0.5], [calendar('calendar'), 0.5]), 0.5],
      [row('bottom', [calendar('spacer'), 0.5], [note('day', 'day', 0), 0.5]), 0.5],
    )
    expect(move(layout, WEEK, 'right')).toBeUndefined()
    expect(move(layout, TODAY, 'left')).toBeUndefined()
  })

  it('enters a stack of pages at the one that overlaps it most', () => {
    const stack = (top: number) =>
      row(
        'pages',
        [note('week', 'week', 0), 0.5],
        [
          column('days', [note('yesterday', 'day', -1), top], [note('today', 'day', 0), 1 - top]),
          0.5,
        ],
      )
    expect(move(stack(0.7), WEEK, 'right')).toEqual(YESTERDAY)
    expect(move(stack(0.3), WEEK, 'right')).toEqual(TODAY)
    // Level: the first one, top to bottom.
    expect(move(stack(0.5), WEEK, 'right')).toEqual(YESTERDAY)
    expect(move(stack(0.5), YESTERDAY, 'left')).toEqual(WEEK)
    expect(move(stack(0.5), TODAY, 'left')).toEqual(WEEK)
  })

  it('finds nothing for a page the layout does not show', () => {
    expect(move(OPEN_PLANNER, TOMORROW, 'left')).toBeUndefined()
  })

  it('walks a row of pages there and back', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.1, max: 10, noNaN: true }), { minLength: 1, maxLength: 6 }),
        (sizes) => {
          const layout = row(
            'pages',
            ...sizes.map((size, i): [Layout, number] => [note(`p${String(i)}`, 'day', i), size]),
          )
          const day = (i: number) => ({ kind: 'day' as const, key: addDays(FOCUS, i) })
          for (let i = 0; i < sizes.length; i++) {
            const right = i + 1 < sizes.length ? day(i + 1) : undefined
            expect(move(layout, day(i), 'right')).toEqual(right)
            if (right !== undefined) expect(move(layout, right, 'left')).toEqual(day(i))
            expect(move(layout, day(i), 'up')).toBeUndefined()
          }
        },
      ),
    )
  })
})
