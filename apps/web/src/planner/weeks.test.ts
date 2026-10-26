import { ISO_WEEK, US_WEEK } from '@agendina/core'
import { describe, expect, it } from 'vitest'
import { monthGrid } from './weeks.ts'

describe('monthGrid', () => {
  it('lays out a month in full weeks starting on the rule’s first day', () => {
    const grid = monthGrid(2026, 10, ISO_WEEK)

    expect(grid[0]).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
    expect(grid.at(-1)?.at(-1)).toBe('2026-11-01')
    expect(grid).toHaveLength(5)
  })

  it('follows a Sunday start', () => {
    expect(monthGrid(2026, 10, US_WEEK)[0]?.[0]).toBe('2026-09-27')
  })

  it('handles February in a leap year', () => {
    const grid = monthGrid(2028, 2, ISO_WEEK)
    expect(grid.flat()).toContain('2028-02-29')
    expect(grid.flat()).not.toContain('2028-03-06')
  })
})
