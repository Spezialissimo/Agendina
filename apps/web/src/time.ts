import type { DayKey } from '@agendina/core'

/** The calendar day of `date` in the user's local time zone. */
export function dayKeyFromDate(date: Date): DayKey {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
