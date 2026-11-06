import { addDays, weekNumber, type DayKey, type WeekRule } from '@agendina/core'
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

/** A page's title: the weekday for a day ("Friday"), "Week 44" for a week. */
export function pageTitle(kind: NoteKind, key: DayKey, locale: string, rule: WeekRule): string {
  return kind === 'day' ? format(key, locale, { weekday: 'long' }) : weekTitle(key, rule)
}

/** What sits under the title: the date of a day ("Nov 6, 2026"), the range of a week. */
export function pageSubtitle(kind: NoteKind, key: DayKey, locale: string): string {
  return kind === 'day'
    ? format(key, locale, { month: 'short', day: 'numeric', year: 'numeric' })
    : formatRange(key, addDays(key, 6), locale)
}

/** What names a page for assistive technology and conflict lists: the full date for a day. */
export function pageLabel(kind: NoteKind, key: DayKey, locale: string, rule: WeekRule): string {
  return kind === 'day'
    ? format(key, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : weekTitle(key, rule)
}

/** E.g. "Week 44": the number of the week containing `day`. */
export function weekTitle(day: DayKey, rule: WeekRule): string {
  return `Week ${String(weekNumber(day, rule).week)}`
}
