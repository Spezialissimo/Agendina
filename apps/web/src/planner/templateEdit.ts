import type { NoteKind } from '@agendina/contract'
import type { DayKey } from '@agendina/core'

/**
 * A template edit in progress. It starts from one page (a day, or a week by its first day) but
 * stays open while the user moves around: the editor shows on whichever page of that kind is
 * being edited, until it is saved or cancelled.
 */
export interface TemplateEdit {
  kind: NoteKind
  /** The page the edit started from: it and every later page made from the template are updated. */
  key: DayKey
  /** The unsaved text, kept here so it survives the editor moving to another page. */
  draft?: string
}

/**
 * The edit after the editor for `closed` closes. A save still running when the user opened another
 * page's template must not close that one.
 */
export function closeEdit(
  current: TemplateEdit | undefined,
  closed: TemplateEdit,
): TemplateEdit | undefined {
  return current?.kind === closed.kind && current.key === closed.key ? undefined : current
}
