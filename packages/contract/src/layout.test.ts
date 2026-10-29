import { OPEN_PLANNER, type Layout } from '@agendina/core'
import { describe, expect, it } from 'vitest'
import { LayoutSchema } from './layout.ts'

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
    ['not an object', 'open-planner'],
  ])('rejects %s', (_, value) => {
    expect(LayoutSchema.safeParse(value).success).toBe(false)
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
