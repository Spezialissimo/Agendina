import type { NoteView } from '@agendina/core'
import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { useApi, useLocale } from '../app/AppProviders.tsx'
import { usePlannerContext } from './PlannerContext.tsx'
import { formatRange, pageTitle } from './weeks.ts'
import { ConflictResolver } from '../editor/ConflictResolver.tsx'
import { PageEditor } from '../editor/PageEditor.tsx'
import { useNoteDocument, type SaveStatus } from '../editor/useNoteDocument.ts'
import { TemplateEditor } from '../templates/TemplateEditor.tsx'
import { useTemplate } from '../templates/useTemplate.ts'
import { addDays } from '@agendina/core'

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
  const template = useTemplate(view.kind)
  const [editingTemplate, setEditingTemplate] = useState(false)
  const [notice, setNotice] = useState<{ key: string; text: string } | undefined>(undefined)

  const title = pageTitle(view.kind, view.key, locale, weekRule)

  return (
    <section className="page" aria-labelledby={titleId} data-editable={view.editable || undefined}>
      <header className="page-header">
        <h2 id={titleId}>{title}</h2>
        {view.kind === 'week' && (
          <p className="page-subtitle">{formatRange(view.key, addDays(view.key, 6), locale)}</p>
        )}
        {view.editable && !editingTemplate && (
          <button
            type="button"
            className="link page-template"
            onClick={() => {
              setNotice(undefined)
              setEditingTemplate(true)
            }}
          >
            Edit {view.kind} template
          </button>
        )}
      </header>
      {notice?.key === view.key && (
        <p className="template-notice" aria-live="polite">
          {notice.text}
        </p>
      )}
      {view.editable && editingTemplate ? (
        template.data !== undefined &&
        note.data !== undefined && (
          <TemplateEditor
            key={`${view.kind}/${view.key}`}
            kind={view.kind}
            pageKey={view.key}
            template={template.data}
            pageText={note.data?.content ?? ''}
            onClose={(text) => {
              setEditingTemplate(false)
              if (text !== undefined) setNotice({ key: view.key, text })
            }}
          />
        )
      ) : view.editable ? (
        <EditablePage key={`${view.kind}/${view.key}`} view={view} label={title} />
      ) : (
        <div className="page-content">
          {note.data === null ? (template.data?.content ?? '') : (note.data?.content ?? '')}
        </div>
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
  const { weekRule } = usePlannerContext()
  return (
    <>
      {document.isError && document.status === 'loading' && (
        <p role="alert">This page could not be loaded. It will be retried when you come back.</p>
      )}
      {/* Only once loaded: text typed into an editor that is still loading would be overwritten. */}
      {document.status === 'loading' ? null : document.conflict === undefined ? (
        <PageEditor
          label={label}
          value={document.text}
          onChange={document.edit}
          weekRule={weekRule}
        />
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
