import { dayKey, type DayKey } from '@agendina/core'

/** The calendar day of `date` in the user's local time zone. */
export function dayKeyFromDate(date: Date): DayKey {
  return dayKey(date.getFullYear(), date.getMonth() + 1, date.getDate())
}
