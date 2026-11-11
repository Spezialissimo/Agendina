import { OPEN_PLANNER, type Layout } from '@agendina/core'
import { describe, expect, it } from 'vitest'
import { LayoutSchema } from './layout.ts'

const note = (id: string, kind: 'day' | 'week', offset: number): Layout => ({
  type: 'panel',
  id,
  panel: { type: 'note', kind, offset },
})

const calendar = (id: string): Layout => ({ type: 'panel', id, panel: { type: 'calendar' } })
const strip = (id: string): Layout => ({ type: 'panel', id, panel: { type: 'weekStrip' } })

const row = (id: string, ...children: [Layout, number][]): Layout => ({
  type: 'split',
  id,
  direction: 'row',
  children: children.map(([node, size]) => ({ node, size })),
})

describe('LayoutSchema', () => {
  it('accepts the default layout', () => {
    expect(LayoutSchema.parse(OPEN_PLANNER)).toEqual(OPEN_PLANNER)
  })

  it.each([
    ['a non-positive size', row('r', [note('a', 'day', 0), 0])],
    ['a duplicate id', row('r', [note('a', 'day', 0), 1], [note('a', 'week', 0), 1])],
    ['a split without children', { type: 'split', id: 'r', direction: 'row', children: [] }],
    ['an unknown panel type', { type: 'panel', id: 'p', panel: { type: 'habits' } }],
    [
      'an unknown direction',
      {
        type: 'split',
        id: 'r',
        direction: 'diagonal',
        children: [{ node: note('a', 'day', 0), size: 1 }],
      },
    ],
    ['a fractional offset', note('a', 'day', 0.5)],
    ['only a calendar', calendar('c')],
    ['two calendars', row('r', [calendar('a'), 1], [calendar('b'), 1], [note('d', 'day', 0), 1])],
    [
      'a calendar with a field it does not have',
      {
        type: 'split',
        id: 'r',
        direction: 'row',
        children: [
          { node: { type: 'panel', id: 'c', panel: { type: 'calendar', kind: 'day' } }, size: 1 },
          { node: note('d', 'day', 0), size: 1 },
        ],
      },
    ],
    ['only a week strip', strip('s')],
    ['two week strips', row('r', [strip('a'), 1], [note('d', 'day', 0), 1], [strip('b'), 1])],
    [
      'a week strip with a field it does not have',
      row(
        'r',
        [{ type: 'panel', id: 's', panel: { type: 'weekStrip', offset: 1 } } as never, 1],
        [note('d', 'day', 0), 1],
      ),
    ],
    [
      'no page that can be written in',
      row('r', [note('a', 'day', -1), 1], [note('b', 'week', 1), 1]),
    ],
    ['two editors for the same day', row('r', [note('a', 'day', 0), 1], [note('b', 'day', 0), 1])],
    [
      'the same read-only page twice',
      row('r', [note('a', 'day', 0), 1], [note('b', 'day', 1), 1], [note('c', 'day', 1), 1]),
    ],
    [
      'more pages than fit on a screen',
      row(
        'r',
        ...Array.from({ length: 7 }, (_, i): [Layout, number] => [note(`d${i}`, 'day', i), 1]),
      ),
    ],
    ['not an object', 'open-planner'],
  ])('rejects %s', (_, value) => {
    expect(LayoutSchema.safeParse(value).success).toBe(false)
  })

  it.each([
    ['only a day page', note('d', 'day', 0)],
    ['only a week page', note('w', 'week', 0)],
    [
      'a neighbour day next to the focused day',
      row('r', [note('a', 'day', -1), 1], [note('b', 'day', 0), 1]),
    ],
  ])('accepts %s', (_, value) => {
    expect(LayoutSchema.safeParse(value).success).toBe(true)
  })

  it('accepts a calendar next to a page to write in, and keeps it as it is', () => {
    const layout = row('r', [calendar('c'), 1], [note('d', 'day', 0), 1])

    expect(LayoutSchema.parse(layout)).toEqual(layout)
  })

  it('accepts a week strip next to a page to write in, and keeps it as it is', () => {
    const layout = row('r', [strip('s'), 1], [note('d', 'day', 0), 1])

    expect(LayoutSchema.parse(layout)).toEqual(layout)
  })

  it('says what is wrong with the pages', () => {
    const result = LayoutSchema.safeParse(
      row('r', [note('a', 'day', 1), 1], [note('b', 'day', 1), 1]),
    )

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Invalid layout: no-editable-page',
      'Invalid layout: duplicate-page',
    ])
  })

  it('names a duplicate id once, even when it is nested', () => {
    const layout = row('outer', [
      row('inner', [note('a', 'day', 0), 1], [note('a', 'day', 1), 1]),
      1,
    ])

    const result = LayoutSchema.safeParse(layout)

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Invalid layout: duplicate id "a"',
    ])
  })
})
