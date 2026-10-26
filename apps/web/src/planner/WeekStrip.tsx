import { addDays, weekDays, weekNumber, type DayKey, type WeekRule } from '@agendina/core'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { useApi, useLocale, useToday } from '../app/AppProviders.tsx'
import { MonthPicker } from './MonthPicker.tsx'
import { format, formatRange } from './weeks.ts'

interface Props {
  focus: DayKey
  rule: WeekRule
  calendarOpen: boolean
  setCalendarOpen: (open: boolean) => void
}

export function WeekStrip({ focus, rule, calendarOpen, setCalendarOpen }: Props) {
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
  const go = (day: DayKey) => void navigate(`/day/${day}`)

  return (
    <nav className="week-strip" aria-label="Week">
      <button
        type="button"
        className="icon"
        aria-label="Previous week"
        onClick={() => {
          go(addDays(focus, -7))
        }}
      >
        ‹
      </button>
      <div className="week-label">
        <span className="week-number">Week {weekNumber(focus, rule).week}</span>
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
        onClick={() => {
          go(addDays(focus, 7))
        }}
      >
        ›
      </button>
      <button
        type="button"
        className="link"
        onClick={() => {
          go(today)
        }}
      >
        Today
      </button>
      <MonthPicker
        focus={focus}
        rule={rule}
        onPick={go}
        open={calendarOpen}
        setOpen={setCalendarOpen}
      />
    </nav>
  )
}
