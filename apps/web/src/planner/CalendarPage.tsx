import type { CalendarView } from '@agendina/core'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { MonthGrid, monthOf, type Month } from './MonthPicker.tsx'
import { usePlannerContext } from './PlannerContext.tsx'
import { usePageFocus } from './pageFocus.ts'

/**
 * The calendar panel: a month that is always open, to pick a day from. It shows the month of the
 * focused day; the arrows browse other months until the focused day changes.
 */
export function CalendarPage({ view }: { view: CalendarView }) {
  const navigate = useNavigate()
  const { weekRule } = usePlannerContext()
  const { focusAfterNavigation } = usePageFocus()
  const [browsed, setBrowsed] = useState<{ from: string; month: Month }>({
    from: view.focus,
    month: monthOf(view.focus),
  })
  // Another day was chosen (here or elsewhere): back to its month.
  const month = browsed.from === view.focus ? browsed.month : monthOf(view.focus)

  return (
    <section className="page calendar-page" aria-label="Calendar">
      <div className="month-calendar">
        <MonthGrid
          focus={view.focus}
          rule={weekRule}
          month={month}
          setMonth={(next) => {
            setBrowsed({ from: view.focus, month: next })
          }}
          onPick={(day) => {
            // Picking a day writes in that day, as in the week strip.
            focusAfterNavigation(day, 'day')
            void navigate(`/day/${day}`)
          }}
        />
      </div>
    </section>
  )
}
