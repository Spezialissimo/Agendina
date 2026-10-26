import { isDayKey, resolveLayout, setSplitSizes } from '@agendina/core'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router'
import { useApi, useToday } from '../app/AppProviders.tsx'
import { LayoutView } from './LayoutView.tsx'
import { PlannerContext } from './PlannerContext.tsx'
import { WeekStrip } from './WeekStrip.tsx'
import { useSettings } from './useSettings.ts'

export function PlannerPage() {
  const { day } = useParams()
  const today = useToday()
  const api = useApi()
  const queryClient = useQueryClient()
  const { settings, isError, update } = useSettings()

  if (day === undefined || !isDayKey(day)) return <Navigate to={`/day/${today}`} replace />

  const signOut = async () => {
    await api.logout()
    await queryClient.resetQueries()
  }

  return (
    <div className="planner">
      <header className="topbar">
        <span className="brand">Agendina</span>
        {settings !== undefined && <WeekStrip focus={day} rule={settings.weekRule} />}
        <button type="button" className="link" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <main className="pages">
        {isError && <p role="alert">Your settings could not be loaded.</p>}
        {settings !== undefined && (
          <PlannerContext value={{ weekRule: settings.weekRule }}>
            <LayoutView
              layout={resolveLayout(settings.layout, day, settings.weekRule)}
              onResize={(splitId, sizes) => {
                update({ ...settings, layout: setSplitSizes(settings.layout, splitId, sizes) })
              }}
            />
          </PlannerContext>
        )}
      </main>
    </div>
  )
}
