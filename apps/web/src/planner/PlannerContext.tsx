import type { WeekRule } from '@agendina/core'
import { createContext, useContext } from 'react'

export const PlannerContext = createContext<{ weekRule: WeekRule } | undefined>(undefined)

export function usePlannerContext() {
  const context = useContext(PlannerContext)
  if (context === undefined) throw new Error('Missing <PlannerContext>')
  return context
}
