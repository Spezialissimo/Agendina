import type { NoteKind } from '@agendina/contract'
import type { WeekRule } from '@agendina/core'
import { createContext, useContext } from 'react'
import type { TemplateEdit } from './templateEdit.ts'

export type TemplateEdits = Partial<Record<NoteKind, TemplateEdit>>

interface Planner {
  weekRule: WeekRule
  /** The template edits in progress: the day and the week template can be open together. */
  templateEdits: TemplateEdits
  /** Called when the editor for `edit` is done. */
  closeTemplate: (edit: TemplateEdit) => void
  /** Keeps the unsaved text of the edit, so it survives navigation. */
  setTemplateDraft: (edit: TemplateEdit, draft: string) => void
}

export const PlannerContext = createContext<Planner | undefined>(undefined)

export function usePlannerContext() {
  const context = useContext(PlannerContext)
  if (context === undefined) throw new Error('Missing <PlannerContext>')
  return context
}
