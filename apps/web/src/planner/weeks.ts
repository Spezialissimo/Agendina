import {
  addDays,
  compareDays,
  weekNumber,
  weekStart,
  type DayKey,
  type WeekRule,
} from '@agendina/core'
import type { NoteKind } from '@agendina/contract'

/** The weeks shown for a month: full weeks (per the rule) covering every day of the month. */
export function monthGrid(year: number, month: number, rule: WeekRule): DayKey[][] {
  const pad = (n: number) => String(n).padStart(2, '0')
  const first = `${String(year).padStart(4, '0')}-${pad(month)}-01`
  const nextMonth =
    month === 12
      ? `${String(year + 1).padStart(4, '0')}-01-01`
      : `${String(year).padStart(4, '0')}-${pad(month + 1)}-01`
  const weeks: DayKey[][] = []
  for (
    let start = weekStart(first, rule);
    compareDays(start, nextMonth) < 0;
    start = addDays(start, 7)
  ) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)))
  }
  return weeks
}

const utc = (day: DayKey) => new Date(`${day}T00:00:00Z`)

export function format(day: DayKey, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(utc(day))
}

/** E.g. "19–25 Oct 2026". */
export function formatRange(from: DayKey, to: DayKey, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatRange(utc(from), utc(to))
}

/** A page's title: the full date for a day, "Week 44" for a week. */
export function pageTitle(kind: NoteKind, key: DayKey, locale: string, rule: WeekRule): string {
  return kind === 'day'
    ? format(key, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `Week ${String(weekNumber(key, rule).week)}`
}
