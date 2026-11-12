import { addDays, weekDays, type DayKey, type WeekStripView } from '@agendina/core'
import { useQuery } from '@tanstack/react-query'
import { useContext } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApi, useLocale, useToday } from '../app/AppProviders.tsx'
import { ChevronLeftIcon, ChevronRightIcon } from '../app/icons.tsx'
import { MonthPicker } from './MonthPicker.tsx'
import { MonthPopupContext, usePlannerContext } from './PlannerContext.tsx'
import { usePageFocus } from './pageFocus.ts'
import { useCurrentDay } from './useCurrentDay.ts'
import { format, formatRange, weekTitle } from './weeks.ts'

interface Props {
  view: WeekStripView
  /** Across when stacked with other panels, down when beside them. */
  orientation: 'horizontal' | 'vertical'
}

/** The week strip panel: the days of the focused week, the week arrows, Today and the month. */
export function WeekStrip({ view, orientation }: Props) {
  const { focus } = view
  const { weekRule: rule } = usePlannerContext()
  const { open: calendarOpen, setOpen: setCalendarOpen } = useContext(MonthPopupContext)
  const api = useApi()
  const locale = useLocale()
  const today = useToday()
  const navigate = useNavigate()
  const days = weekDays(focus, rule)
  const [first, last] = [days[0] as DayKey, days[6] as DayKey]
  const written = useQuery({
    queryKey: ['notes', 'day', first, last],
    queryFn: async () => {
      const notes = await api.listNotes('day', first, last)
      return new Set(notes.filter((n) => n.content.trim() !== '').map((n) => n.key))
    },
  })
  const { focusAfterNavigation } = usePageFocus()
  /** Picking a day writes in that day. */
  const pick = (day: DayKey) => {
    focusAfterNavigation(day, 'day')
    void navigate(`/day/${day}`)
  }
  /**
   * The week arrows and Today keep the side the user was writing on. Pressed with Enter or Space
   * (a click without a press count), focus stays on the button, to press it again.
   */
  const step = (event: { detail: number }, day: DayKey) => {
    if (event.detail !== 0) focusAfterNavigation(day)
    void navigate(`/day/${day}`)
  }
  const currentDay = useCurrentDay(focus)

  return (
    // Clicks here keep the side the user was writing on, for the week arrows.
    <nav
      className="week-strip"
      aria-label="Week"
      data-orientation={orientation}
      data-keeps-page-side=""
    >
      <button
        type="button"
        className="icon"
        aria-label="Previous week"
        title="Previous week"
        onClick={(event) => {
          step(event, addDays(currentDay(), -7))
        }}
      >
        <ChevronLeftIcon />
      </button>
      <div className="week-label">
        <span className="week-number">{weekTitle(focus, rule)}</span>
        <span className="week-range">{formatRange(first, last, locale)}</span>
      </div>
      <ol className="week-days">
        {days.map((day) => {
          const weekday = format(day, locale, { weekday: 'short' })
          const date = format(day, locale, { day: 'numeric' })
          const notes = written.data?.has(day) === true
          const label = [`${weekday} ${date}`, day === today ? 'today' : '', notes ? 'written' : '']
            .filter(Boolean)
            .join(', ')
          return (
            <li key={day}>
              <Link
                to={`/day/${day}`}
                className="week-day"
                aria-label={label}
                aria-current={day === focus ? 'date' : undefined}
                data-today={day === today || undefined}
                onClick={(event) => {
                  const plain = !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                  if (event.button === 0 && plain) focusAfterNavigation(day, 'day')
                }}
              >
                <span className="week-day-name">{weekday}</span>
                <span className="week-day-date">{date}</span>
                {notes && <span className="written-dot" aria-hidden="true" />}
              </Link>
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        className="icon"
        aria-label="Next week"
        title="Next week"
        onClick={(event) => {
          step(event, addDays(currentDay(), 7))
        }}
      >
        <ChevronRightIcon />
      </button>
      <button
        type="button"
        className="link"
        onClick={(event) => {
          step(event, today)
        }}
      >
        Today
      </button>
      <MonthPicker
        focus={focus}
        rule={rule}
        onPick={(day) => {
          pick(day)
        }}
        open={calendarOpen}
        setOpen={setCalendarOpen}
        strip={orientation === 'horizontal' ? 'across' : 'standing'}
      />
    </nav>
  )
}
