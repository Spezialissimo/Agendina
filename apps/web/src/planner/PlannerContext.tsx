import type { WeekRule } from '@agendina/core'
import { createContext, useContext } from 'react'
import type { TemplateEdit } from './templateEdit.ts'

interface Planner {
  weekRule: WeekRule
  editingTemplate: TemplateEdit | undefined
  /** Called when the editor for `edit` is done. */
  closeTemplate: (edit: TemplateEdit) => void
}

export const PlannerContext = createContext<Planner | undefined>(undefined)

export function usePlannerContext() {
  const context = useContext(PlannerContext)
  if (context === undefined) throw new Error('Missing <PlannerContext>')
  return context
}
