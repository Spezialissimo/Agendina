import { weekNumber, type DayKey, type WeekRule } from '@agendina/core'
import type { NoteKind } from '@agendina/contract'

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
