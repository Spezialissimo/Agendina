import type { DayKey } from '@agendina/core'

/** The calendar day of `date` in the user's local time zone. */
export function dayKeyFromDate(date: Date): DayKey {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** E.g. "Monday, 26 October 2026" (en-GB). DayKeys have no time zone, so they are formatted as UTC. */
export function formatDay(day: DayKey, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))
}
