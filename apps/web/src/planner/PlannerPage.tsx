import {
  addDays,
  isDayKey,
  resolveKeymap,
  resolveLayout,
  setSplitSizes,
  type DayKey,
} from '@agendina/core'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useApi, useToday } from '../app/AppProviders.tsx'
import { CommandPalette } from '../commands/CommandPalette.tsx'
import { COMMANDS, type CommandId } from '../commands/registry.ts'
import { useShortcuts } from '../commands/useShortcuts.ts'
import { LayoutView } from './LayoutView.tsx'
import { PlannerContext } from './PlannerContext.tsx'
import { WeekStrip } from './WeekStrip.tsx'
import { useCurrentDay } from './useCurrentDay.ts'
import { useSettings } from './useSettings.ts'

export function PlannerPage() {
  const { day } = useParams()
  const today = useToday()
  if (day === undefined || !isDayKey(day)) return <Navigate to={`/day/${today}`} replace />
  return <Planner focus={day} />
}

function Planner({ focus }: { focus: DayKey }) {
  const today = useToday()
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { settings, isError, update } = useSettings()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const currentDay = useCurrentDay(focus)
  const keymap = useMemo(() => resolveKeymap(COMMANDS, settings?.keymap ?? {}), [settings?.keymap])

  const run = useCallback(
    (id: CommandId) => {
      const go = (day: DayKey) => void navigate(`/day/${day}`)
      switch (id) {
        case 'focus.previousDay':
          go(addDays(currentDay(), -1))
          break
        case 'focus.nextDay':
          go(addDays(currentDay(), 1))
          break
        case 'focus.previousWeek':
          go(addDays(currentDay(), -7))
          break
        case 'focus.nextWeek':
          go(addDays(currentDay(), 7))
          break
        case 'focus.today':
          go(today)
          break
        case 'calendar.open':
          setCalendarOpen(true)
          break
        case 'palette.open':
          setPaletteOpen(true)
          break
        case 'account.signOut':
          void api.logout().then(() => queryClient.resetQueries())
          break
      }
    },
    [currentDay, today, navigate, api, queryClient],
  )

  useShortcuts(keymap, run, !paletteOpen)

  return (
    <div className="planner">
      <header className="topbar">
        <span className="brand">Agendina</span>
        {settings !== undefined && (
          <WeekStrip
            focus={focus}
            rule={settings.weekRule}
            calendarOpen={calendarOpen}
            setCalendarOpen={setCalendarOpen}
          />
        )}
        <button
          type="button"
          className="link"
          onClick={() => {
            run('account.signOut')
          }}
        >
          Sign out
        </button>
      </header>
      <main className="pages">
        {isError && <p role="alert">Your settings could not be loaded.</p>}
        {settings !== undefined && (
          <PlannerContext value={{ weekRule: settings.weekRule }}>
            <LayoutView
              layout={resolveLayout(settings.layout, focus, settings.weekRule)}
              onResize={(splitId, sizes) => {
                update({ ...settings, layout: setSplitSizes(settings.layout, splitId, sizes) })
              }}
            />
          </PlannerContext>
        )}
      </main>
      {paletteOpen && (
        <CommandPalette
          keymap={keymap}
          onRun={run}
          onClose={() => {
            setPaletteOpen(false)
          }}
        />
      )}
    </div>
  )
}
