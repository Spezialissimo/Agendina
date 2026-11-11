import { dayKey, monthGrid, weekNumber, type DayKey, type WeekRule } from '@agendina/core'
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { useLocale, useToday } from '../app/AppProviders.tsx'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '../app/icons.tsx'
import { format, formatRange, weekTitle } from './weeks.ts'

interface Props {
  focus: DayKey
  rule: WeekRule
  onPick: (day: DayKey) => void
}

/** The calendar button: a month calendar to jump to any day. */
export function MonthPicker({
  focus,
  rule,
  onPick,
  open,
  setOpen,
}: Props & { open: boolean; setOpen: (open: boolean) => void }) {
  const container = useRef<HTMLDivElement>(null)
  return (
    <div ref={container} className="month-picker">
      <button
        type="button"
        className="icon"
        aria-label="Choose a day"
        title="Choose a day"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
        }}
      >
        <CalendarIcon />
      </button>
      {open && (
        <MonthCalendar
          focus={focus}
          rule={rule}
          picker={container}
          onPick={(day) => {
            setOpen(false)
            onPick(day)
          }}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function MonthCalendar({
  focus,
  rule,
  picker,
  onPick,
  onClose,
}: Props & {
  /** The calendar with its button: a press on the button is the button's to handle. */
  picker: RefObject<HTMLElement | null>
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [month, setMonth] = useState(monthOf(focus))
  const title = useMonthTitle(month)

  const close = useEffectEvent(onClose)
  useEffect(() => {
    // The keyboard moves into the calendar, and Escape gives it back to where it was. Picking a
    // day or pressing elsewhere puts focus where the user went instead.
    const before = document.activeElement
    const current = ref.current?.querySelector<HTMLElement>('[aria-current="date"]')
    ;(current ?? ref.current?.querySelector('button'))?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      if (before instanceof HTMLElement && before.isConnected) before.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [picker])

  return (
    <div ref={ref} className="month-calendar" role="dialog" aria-label={title}>
      <MonthGrid focus={focus} rule={rule} month={month} setMonth={setMonth} onPick={onPick} />
    </div>
  )
}

export interface Month {
  year: number
  month: number
}

export function monthOf(day: DayKey): Month {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) }
}

function useMonthTitle({ year, month }: Month): string {
  return format(dayKey(year, month, 1), useLocale(), { month: 'long', year: 'numeric' })
}

/**
 * A month to pick a day from, with arrows to the months around it. Used by the pop-up of the
 * calendar button and by the calendar panel.
 */
export function MonthGrid({
  focus,
  rule,
  month,
  setMonth,
  onPick,
}: Props & { month: Month; setMonth: (month: Month) => void }) {
  const locale = useLocale()
  const today = useToday()
  const weeks = monthGrid(month.year, month.month, rule)
  const monthKey = dayKey(month.year, month.month, 1).slice(0, 7)

  return (
    <>
      <MonthHeader month={month} setMonth={setMonth} />
      <table>
        <thead>
          <tr>
            {weeks[0]?.map((day) => (
              <th key={day} scope="col">
                {format(day, locale, { weekday: 'narrow' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => (
                <td key={day}>
                  <button
                    type="button"
                    aria-label={format(day, locale, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    aria-current={day === focus ? 'date' : undefined}
                    data-outside={!day.startsWith(monthKey) || undefined}
                    data-today={day === today || undefined}
                    onClick={() => {
                      onPick(day)
                    }}
                  >
                    {Number(day.slice(8))}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/** The month's name between arrows to the months around it. */
function MonthHeader({ month, setMonth }: { month: Month; setMonth: (month: Month) => void }) {
  const title = useMonthTitle(month)
  const shift = (delta: number) => {
    const index = month.year * 12 + (month.month - 1) + delta
    setMonth({ year: Math.floor(index / 12), month: (index % 12) + 1 })
  }
  return (
    <div className="month-header">
      <button
        type="button"
        className="icon"
        aria-label="Previous month"
        onClick={() => {
          shift(-1)
        }}
      >
        <ChevronLeftIcon />
      </button>
      <span>{title}</span>
      <button
        type="button"
        className="icon"
        aria-label="Next month"
        onClick={() => {
          shift(1)
        }}
      >
        <ChevronRightIcon />
      </button>
    </div>
  )
}

/**
 * A month to pick a week from: each row is one week, a button with its number. `week` is the
 * chosen week's first day; `onPick` gets the first day of the week clicked.
 */
export function WeekGrid({
  week: chosen,
  rule,
  month,
  setMonth,
  onPick,
}: {
  week: DayKey
  rule: WeekRule
  month: Month
  setMonth: (month: Month) => void
  onPick: (week: DayKey) => void
}) {
  const locale = useLocale()
  const today = useToday()
  const weeks = monthGrid(month.year, month.month, rule)
  const monthKey = dayKey(month.year, month.month, 1).slice(0, 7)
  return (
    <>
      <MonthHeader month={month} setMonth={setMonth} />
      <div className="week-grid">
        <div className="week-grid-row week-grid-head" aria-hidden="true">
          <span>W</span>
          {weeks[0]?.map((day) => (
            <span key={day}>{format(day, locale, { weekday: 'narrow' })}</span>
          ))}
        </div>
        {weeks.map((days) => {
          const first = days[0] as DayKey
          const last = days[6] as DayKey
          return (
            <button
              key={first}
              type="button"
              className="week-grid-row"
              aria-label={`${weekTitle(first, rule)}, ${formatRange(first, last, locale)}`}
              aria-current={first === chosen || undefined}
              onClick={() => {
                onPick(first)
              }}
            >
              <span className="week-grid-number">{weekNumber(first, rule).week}</span>
              {days.map((day) => (
                <span
                  key={day}
                  data-outside={!day.startsWith(monthKey) || undefined}
                  data-today={day === today || undefined}
                >
                  {Number(day.slice(8))}
                </span>
              ))}
            </button>
          )
        })}
      </div>
    </>
  )
}
