import type { WeekRule } from '@agendina/core'
import { createContext, useContext } from 'react'

interface Planner {
  weekRule: WeekRule
}

export const PlannerContext = createContext<Planner | undefined>(undefined)

export function usePlannerContext() {
  const context = useContext(PlannerContext)
  if (context === undefined) throw new Error('Missing <PlannerContext>')
  return context
}
