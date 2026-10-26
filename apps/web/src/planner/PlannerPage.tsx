import { isDayKey } from '@agendina/core'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router'
import { useApi, useLocale, useToday } from '../app/AppProviders.tsx'
import { formatDay } from '../time.ts'

export function PlannerPage() {
  const { day } = useParams()
  const today = useToday()
  const locale = useLocale()
  const api = useApi()
  const queryClient = useQueryClient()

  if (day === undefined || !isDayKey(day)) return <Navigate to={`/day/${today}`} replace />

  const signOut = async () => {
    await api.logout()
    await queryClient.resetQueries()
  }

  return (
    <div className="planner">
      <header className="topbar">
        <span className="brand">Agendina</span>
        <button type="button" className="link" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <h1>{formatDay(day, locale)}</h1>
    </div>
  )
}
