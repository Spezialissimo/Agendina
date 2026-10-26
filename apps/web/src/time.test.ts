import { describe, expect, it } from 'vitest'
import { dayKeyFromDate, formatDay } from './time.ts'

describe('dayKeyFromDate', () => {
  it('uses the local calendar day, not UTC', () => {
    expect(dayKeyFromDate(new Date(2026, 9, 26, 23, 59))).toBe('2026-10-26')
    expect(dayKeyFromDate(new Date(2026, 9, 26, 0, 1))).toBe('2026-10-26')
    expect(dayKeyFromDate(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01')
  })
})

describe('formatDay', () => {
  it('formats a day in the given locale, independent of the time zone', () => {
    expect(formatDay('2026-10-26', 'en-GB')).toBe('Monday, 26 October 2026')
    expect(formatDay('2026-10-26', 'it-IT')).toBe('lunedì 26 ottobre 2026')
  })
})
