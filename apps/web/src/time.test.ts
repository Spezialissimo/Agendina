import { describe, expect, it } from 'vitest'
import { dayKeyFromDate } from './time.ts'

describe('dayKeyFromDate', () => {
  it('uses the local calendar day, not UTC', () => {
    expect(dayKeyFromDate(new Date(2026, 9, 26, 23, 59))).toBe('2026-10-26')
    expect(dayKeyFromDate(new Date(2026, 9, 26, 0, 1))).toBe('2026-10-26')
    expect(dayKeyFromDate(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01')
  })
})
