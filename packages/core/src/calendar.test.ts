import { getISODay, getWeek, getWeekYear } from 'date-fns'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ISO_WEEK,
  US_WEEK,
  addDays,
  compareDays,
  isDayKey,
  parseDayKey,
  weekDays,
  weekNumber,
  weekStart,
  weekday,
  type DayKey,
  type WeekRule,
} from './calendar.ts'

// Days between 1900-01-01 and 2199-12-31, as DayKeys.
const anyDay: fc.Arbitrary<DayKey> = fc
  .date({
    min: new Date(Date.UTC(1900, 0, 1)),
    max: new Date(Date.UTC(2199, 11, 31)),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString().slice(0, 10))

const anyRule: fc.Arbitrary<WeekRule> = fc.record({
  firstDay: fc.constantFrom(1, 2, 3, 4, 5, 6, 7),
  minimalDays: fc.constantFrom(1, 2, 3, 4, 5, 6, 7),
})

/** A local-time Date at noon, so date-fns is unaffected by DST transitions. */
function toLocalNoon(day: DayKey): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, 12)
}

describe('DayKey parsing', () => {
  it.each(['2026-10-24', '2024-02-29', '2000-02-29', '1999-12-31'])('accepts %s', (s) => {
    expect(isDayKey(s)).toBe(true)
    expect(parseDayKey(s)).toBe(s)
  })

  it.each([
    '2026-13-01',
    '2026-00-10',
    '2026-02-30',
    '2023-02-29',
    '1900-02-29',
    '2026-1-1',
    '2026-10-24T00:00',
    '',
  ])('rejects %j', (s) => {
    expect(isDayKey(s)).toBe(false)
    expect(() => parseDayKey(s)).toThrow(/Invalid day/)
  })
})

describe('addDays', () => {
  it.each([
    ['2026-10-24', 1, '2026-10-25'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2023-02-28', 1, '2023-03-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-10-24', 7, '2026-10-31'],
    ['2026-10-24', 0, '2026-10-24'],
  ] as const)('%s + %i = %s', (day, n, expected) => {
    expect(addDays(day, n)).toBe(expected)
  })

  it('is reversible', () => {
    fc.assert(
      fc.property(anyDay, fc.integer({ min: -5000, max: 5000 }), (day, n) => {
        expect(addDays(addDays(day, n), -n)).toBe(day)
      }),
    )
  })

  it('always produces valid days that are ordered like the offset', () => {
    fc.assert(
      fc.property(anyDay, fc.integer({ min: -5000, max: 5000 }), (day, n) => {
        const result = addDays(day, n)
        expect(isDayKey(result)).toBe(true)
        expect(Math.sign(compareDays(result, day))).toBe(Math.sign(n))
      }),
    )
  })
})

describe('weekday', () => {
  it.each([
    ['2026-10-19', 1],
    ['2026-10-24', 6],
    ['2026-10-25', 7],
    ['2000-01-01', 6],
  ] as const)('%s is ISO weekday %i', (day, expected) => {
    expect(weekday(day)).toBe(expected)
  })

  it('matches an independent implementation', () => {
    fc.assert(
      fc.property(anyDay, (day) => {
        expect(weekday(day)).toBe(getISODay(toLocalNoon(day)))
      }),
    )
  })
})

describe('weekStart', () => {
  it('is Monday for ISO weeks and Sunday for US weeks', () => {
    expect(weekStart('2026-10-24', ISO_WEEK)).toBe('2026-10-19')
    expect(weekStart('2026-10-25', ISO_WEEK)).toBe('2026-10-19')
    expect(weekStart('2026-10-24', US_WEEK)).toBe('2026-10-18')
    expect(weekStart('2026-10-25', US_WEEK)).toBe('2026-10-25')
  })

  it('is the configured first day, at most 6 days before the given day', () => {
    fc.assert(
      fc.property(anyDay, anyRule, (day, rule) => {
        const start = weekStart(day, rule)
        expect(weekday(start)).toBe(rule.firstDay)
        expect(compareDays(start, day)).toBeLessThanOrEqual(0)
        expect(compareDays(addDays(start, 6), day)).toBeGreaterThanOrEqual(0)
      }),
    )
  })
})

describe('weekDays', () => {
  it('lists the 7 days of the week containing the day, in order', () => {
    expect(weekDays('2026-10-24', ISO_WEEK)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ])
  })

  it('is the same for every day of a week', () => {
    fc.assert(
      fc.property(anyDay, anyRule, fc.integer({ min: 0, max: 6 }), (day, rule, i) => {
        const days = weekDays(day, rule)
        expect(weekDays(days[i] as DayKey, rule)).toEqual(days)
      }),
    )
  })
})

describe('weekNumber', () => {
  it.each([
    ['2026-01-01', 2026, 1],
    ['2026-10-24', 2026, 43],
    ['2026-12-31', 2026, 53],
    ['2027-01-03', 2026, 53],
    ['2027-01-04', 2027, 1],
    ['2024-12-30', 2025, 1],
    ['2021-01-03', 2020, 53],
  ] as const)('ISO: %s is week %i-W%i', (day, year, week) => {
    expect(weekNumber(day, ISO_WEEK)).toEqual({ year, week })
  })

  it.each([
    ['2025-12-28', 2026, 1],
    ['2026-01-01', 2026, 1],
    ['2026-01-04', 2026, 2],
    ['2026-10-24', 2026, 43],
  ] as const)('US: %s is week %i-W%i', (day, year, week) => {
    expect(weekNumber(day, US_WEEK)).toEqual({ year, week })
  })

  it('matches an independent implementation for every week rule', () => {
    fc.assert(
      fc.property(anyDay, anyRule, (day, rule) => {
        const options = {
          weekStartsOn: (rule.firstDay % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
          // date-fns types only allow 1 | 4, but its implementation handles any value 1–7.
          firstWeekContainsDate: rule.minimalDays as 1 | 4,
        }
        expect(weekNumber(day, rule)).toEqual({
          year: getWeekYear(toLocalNoon(day), options),
          week: getWeek(toLocalNoon(day), options),
        })
      }),
      { numRuns: 2000 },
    )
  })

  it('is the same for every day of a week', () => {
    fc.assert(
      fc.property(anyDay, anyRule, (day, rule) => {
        const days = weekDays(day, rule)
        for (const d of days) expect(weekNumber(d, rule)).toEqual(weekNumber(day, rule))
      }),
    )
  })
})
