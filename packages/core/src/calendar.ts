/** A calendar day as `YYYY-MM-DD`. Has no time and no time zone. */
export type DayKey = string

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * How weeks are laid out and numbered: the first day of the week, and how many days of a new
 * year the first week must contain to count as week 1 (the CLDR / java.time model).
 */
export interface WeekRule {
  firstDay: Weekday
  minimalDays: 1 | 2 | 3 | 4 | 5 | 6 | 7
}

export const ISO_WEEK: WeekRule = { firstDay: 1, minimalDays: 4 }
export const US_WEEK: WeekRule = { firstDay: 7, minimalDays: 1 }

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isDayKey(value: string): value is DayKey {
  const match = DAY_KEY_PATTERN.exec(value)
  if (match === null) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

export function parseDayKey(value: string): DayKey {
  if (isDayKey(value)) return value
  throw new Error(`Invalid day ${JSON.stringify(value)}: expected YYYY-MM-DD`)
}

export function addDays(day: DayKey, days: number): DayKey {
  return fromEpochDay(toEpochDay(day) + days)
}

/** Negative when `a` is before `b`, zero when equal, positive when after. */
export function compareDays(a: DayKey, b: DayKey): number {
  return toEpochDay(a) - toEpochDay(b)
}

export function weekday(day: DayKey): Weekday {
  // 1970-01-01 was a Thursday (ISO weekday 4).
  return (mod(toEpochDay(day) + 3, 7) + 1) as Weekday
}

/** The first day of the week containing `day`. Also identifies that week's note. */
export function weekStart(day: DayKey, rule: WeekRule): DayKey {
  return addDays(day, -mod(weekday(day) - rule.firstDay, 7))
}

export function weekDays(day: DayKey, rule: WeekRule): DayKey[] {
  const start = weekStart(day, rule)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** The week-based year and week number (1–53) of `day`, e.g. `{ year: 2026, week: 43 }`. */
export function weekNumber(day: DayKey, rule: WeekRule): { year: number; week: number } {
  let year = yearOf(day)
  if (compareDays(day, firstWeekStart(year, rule)) < 0) year -= 1
  else if (compareDays(day, firstWeekStart(year + 1, rule)) >= 0) year += 1
  const weeks = compareDays(weekStart(day, rule), firstWeekStart(year, rule)) / 7
  return { year, week: weeks + 1 }
}

/** Week 1 is the first week with at least `minimalDays` days in the year: the one containing Jan `minimalDays`. */
function firstWeekStart(year: number, rule: WeekRule): DayKey {
  return weekStart(`${pad(year, 4)}-01-${pad(rule.minimalDays, 2)}`, rule)
}

function yearOf(day: DayKey): number {
  return Number(day.slice(0, 4))
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

// Days since 1970-01-01, after Howard Hinnant's `days_from_civil` / `civil_from_days`.
function toEpochDay(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const year = m <= 2 ? y - 1 : y
  const era = Math.floor(year / 400)
  const yearOfEra = year - era * 400
  const dayOfYear = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

function fromEpochDay(epochDay: number): DayKey {
  const z = epochDay + 719468
  const era = Math.floor(z / 146097)
  const dayOfEra = z - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  )
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const mp = Math.floor((5 * dayOfYear + 2) / 153)
  const d = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const y = yearOfEra + era * 400 + (m <= 2 ? 1 : 0)
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}
