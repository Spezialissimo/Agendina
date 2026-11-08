import type { NoteKind } from '@agendina/contract'
import type { DayKey } from '@agendina/core'

/** The page whose template is being edited: a day, or a week by its first day. */
export interface TemplateEdit {
  kind: NoteKind
  key: DayKey
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
