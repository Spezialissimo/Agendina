import type { NoteView } from '@agendina/core'
import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useNavigate } from 'react-router'
import { useApi, useLocale } from '../app/AppProviders.tsx'
import { usePlannerContext } from './PlannerContext.tsx'
import { format, formatRange } from './weeks.ts'
import { ConflictResolver } from '../editor/ConflictResolver.tsx'
import { PageEditor } from '../editor/PageEditor.tsx'
import { useNoteDocument, type SaveStatus } from '../editor/useNoteDocument.ts'
import { addDays, weekNumber } from '@agendina/core'

/** One page of the planner: a day or a week. Read-only neighbours open their day when clicked. */
export function NotePage({ view }: { view: NoteView }) {
  const api = useApi()
  const locale = useLocale()
  const navigate = useNavigate()
  const { weekRule } = usePlannerContext()
  const titleId = useId()
  const note = useQuery({
    queryKey: ['note', view.kind, view.key],
    queryFn: () => api.getNote(view.kind, view.key),
  })

  const title =
    view.kind === 'day'
      ? format(view.key, locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : `Week ${weekNumber(view.key, weekRule).week}`

  return (
    <section className="page" aria-labelledby={titleId} data-editable={view.editable || undefined}>
      <header className="page-header">
        <h2 id={titleId}>{title}</h2>
        {view.kind === 'week' && (
          <p className="page-subtitle">{formatRange(view.key, addDays(view.key, 6), locale)}</p>
        )}
      </header>
      {view.editable ? (
        <EditablePage key={`${view.kind}/${view.key}`} view={view} label={title} />
      ) : (
        <div className="page-content">{note.data?.content ?? ''}</div>
      )}
      {view.focusOnClick !== undefined && (
        <button
          type="button"
          className="page-open"
          aria-label={`Open ${view.kind === 'day' ? title : `${title} (${formatRange(view.key, addDays(view.key, 6), locale)})`}`}
          onClick={() => void navigate(`/day/${view.focusOnClick ?? ''}`)}
        />
      )}
    </section>
  )
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  loading: '',
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  offline: 'Offline, will retry',
  conflict: 'Conflict: this page changed elsewhere',
}

function EditablePage({ view, label }: { view: NoteView; label: string }) {
  const document = useNoteDocument(view.kind, view.key)
  return (
    <>
      {document.conflict === undefined ? (
        <PageEditor label={label} value={document.text} onChange={document.edit} />
      ) : (
        <ConflictResolver
          chunks={document.conflict.chunks}
          onResolve={document.resolve}
          onDiscard={document.discard}
        />
      )}
      <p className="save-status" role="status" data-status={document.status}>
        {STATUS_TEXT[document.status]}
      </p>
    </>
  )
}
