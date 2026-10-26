import type { DayKey, WeekRule } from '@agendina/core'
import { useEffect, useRef, useState } from 'react'
import { useLocale, useToday } from '../app/AppProviders.tsx'
import { format, monthGrid } from './weeks.ts'

interface Props {
  focus: DayKey
  rule: WeekRule
  onPick: (day: DayKey) => void
}

/** The calendar button: a month calendar to jump to any day. */
export function MonthPicker({ focus, rule, onPick }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="month-picker">
      <button
        type="button"
        className="icon"
        aria-label="Choose a day"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
        }}
      >
        <CalendarIcon />
      </button>
      {open && (
        <MonthCalendar
          focus={focus}
          rule={rule}
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

function MonthCalendar({ focus, rule, onPick, onClose }: Props & { onClose: () => void }) {
  const locale = useLocale()
  const today = useToday()
  const [month, setMonth] = useState({
    year: Number(focus.slice(0, 4)),
    month: Number(focus.slice(5, 7)),
  })
  const ref = useRef<HTMLDivElement>(null)
  const weeks = monthGrid(month.year, month.month, rule)
  const monthKey = `${String(month.year).padStart(4, '0')}-${String(month.month).padStart(2, '0')}`
  const title = format(`${monthKey}-01`, locale, { month: 'long', year: 'numeric' })

  useEffect(() => {
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !ref.current?.contains(event.target as Node)
      )
        onClose()
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', close)
    }
  }, [onClose])

  const shift = (delta: number) => {
    setMonth(({ year, month: m }) => {
      const index = year * 12 + (m - 1) + delta
      return { year: Math.floor(index / 12), month: (index % 12) + 1 }
    })
  }

  return (
    <div ref={ref} className="month-calendar" role="dialog" aria-label={title}>
      <div className="month-header">
        <button
          type="button"
          className="icon"
          aria-label="Previous month"
          onClick={() => {
            shift(-1)
          }}
        >
          ‹
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
          ›
        </button>
      </div>
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
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  )
}
