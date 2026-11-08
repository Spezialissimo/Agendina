import { addDays, compareDays, type DayKey, type NoteView } from '@agendina/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useApi, useLocale } from '../app/AppProviders.tsx'
import { usePlannerContext } from './PlannerContext.tsx'
import { nextTextSize, TEXT_SIZE_LABEL, useTextSize, writeTextSize } from './textSize.ts'
import { pageLabel, pageSubtitle, pageTitle } from './weeks.ts'
import { ConflictResolver } from '../editor/ConflictResolver.tsx'
import { PageEditor } from '../editor/PageEditor.tsx'
import { useNoteDocument, type SaveStatus } from '../editor/useNoteDocument.ts'
import { TemplateEditor } from '../templates/TemplateEditor.tsx'
import { useTemplate } from '../templates/useTemplate.ts'

/**
 * The key of the note shown for `view`. A week page is keyed by the week's first day, but pages
 * written before the user changed the week start begin on another day of the week: show the
 * earliest of those when there is no page for the first day. Undefined while loading, so nothing
 * is typed into a page that is about to change.
 */
function usePageKey(view: NoteView): DayKey | undefined {
  const api = useApi()
  const last = addDays(view.key, 6)
  const notes = useQuery({
    queryKey: ['notes', 'week', view.key, last],
    queryFn: () => api.listNotes('week', view.key, last),
    enabled: view.kind === 'week',
  })
  if (view.kind === 'day') return view.key
  if (notes.data === undefined) return notes.isError ? view.key : undefined
  const keys = notes.data.map((n) => n.key).sort(compareDays)
  return keys.includes(view.key) ? view.key : (keys[0] ?? view.key)
}

/** One page of the planner: a day or a week. Read-only neighbours open their day when clicked. */
export function NotePage({ view }: { view: NoteView }) {
  const api = useApi()
  const locale = useLocale()
  const navigate = useNavigate()
  const { weekRule, editingTemplate, closeTemplate } = usePlannerContext()
  const pageKey = usePageKey(view)
  const note = useQuery({
    queryKey: ['note', view.kind, pageKey],
    queryFn: () => api.getNote(view.kind, pageKey ?? view.key),
    enabled: pageKey !== undefined,
  })
  const template = useTemplate(view.kind)
  const textSize = useTextSize(view.kind)
  const [notice, setNotice] = useState<{ key: string; text: string } | undefined>(undefined)

  const title = pageTitle(view.kind, view.key, locale, weekRule)
  const subtitle = pageSubtitle(view.kind, view.key, locale)
  // The heading is only the weekday for a day: the section is named by the whole date.
  const label = pageLabel(view.kind, view.key, locale, weekRule)

  return (
    <section
      className="page"
      aria-label={label}
      data-editable={view.editable || undefined}
      data-page-kind={view.kind}
      data-text-size={textSize}
    >
      <header className="page-header">
        <h2>{title}</h2>
        <p className="page-subtitle">{subtitle}</p>
        {view.editable && (
          <button
            type="button"
            className="link page-text-size"
            // The name starts with the visible "Aa" (WCAG 2.5.3, label in name).
            aria-label={`Aa, text size: ${TEXT_SIZE_LABEL[textSize]}`}
            title={`Text size: ${TEXT_SIZE_LABEL[textSize]}`}
            onClick={() => {
              writeTextSize(view.kind, nextTextSize(textSize))
            }}
          >
            Aa
          </button>
        )}
      </header>
      {notice !== undefined && notice.key === pageKey && (
        <p className="template-notice" aria-live="polite">
          {notice.text}
        </p>
      )}
      {pageKey === undefined ? null : view.editable &&
        editingTemplate?.kind === view.kind &&
        editingTemplate.key === view.key ? (
        template.data !== undefined &&
        note.data !== undefined && (
          <TemplateEditor
            key={`${view.kind}/${pageKey}`}
            kind={view.kind}
            pageKey={pageKey}
            template={template.data}
            pageText={note.data?.content ?? ''}
            onClose={(text) => {
              closeTemplate({ kind: view.kind, key: view.key })
              if (text !== undefined) setNotice({ key: pageKey, text })
            }}
          />
        )
      ) : view.editable ? (
        <EditablePage
          key={`${view.kind}/${pageKey}`}
          view={{ ...view, key: pageKey }}
          label={label}
        />
      ) : (
        <div className="page-content">
          {note.data === null ? (template.data?.content ?? '') : (note.data?.content ?? '')}
        </div>
      )}
      {view.focusOnClick !== undefined && (
        <button
          type="button"
          className="page-open"
          aria-label={`Open ${view.kind === 'day' ? label : `${label} (${subtitle})`}`}
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
