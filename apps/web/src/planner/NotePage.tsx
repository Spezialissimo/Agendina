import { addDays, compareDays, type DayKey, type NoteView } from '@agendina/core'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useApi, useLocale } from '../app/AppProviders.tsx'
import { usePlannerContext } from './PlannerContext.tsx'
import { useFocusRequest } from './pageFocus.ts'
import { nextTextSize, TEXT_SIZE_LABEL, useTextSize, writeTextSize } from './textSize.ts'
import { pageLabel, pageSubtitle, pageTitle } from './weeks.ts'
import { ConflictResolver } from '../editor/ConflictResolver.tsx'
import { PageEditor } from '../editor/PageEditor.tsx'
import {
  browserStorage,
  loadPositions,
  placeSelection,
  recallPosition,
  rememberPosition,
  savePositions,
  type PageSelection,
} from '../editor/pagePositions.ts'
import { useNoteDocument, type SaveStatus } from '../editor/useNoteDocument.ts'

/**
 * The key of the note shown for `view`. A week page is keyed by the week's first day, but pages
 * written before the user changed the week start begin on another day of the week: show the
 * earliest of those when there is no page for the first day. Undefined while loading, so nothing
 * is typed into a page that is about to change.
 */
function usePageKey(view: Pick<NoteView, 'kind' | 'key'>): DayKey | undefined {
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

/** One page of the planner: a day or a week, written in where it is. */
export function NotePage({ view }: { view: NoteView }) {
  const locale = useLocale()
  const { weekRule } = usePlannerContext()
  const pageKey = usePageKey(view)
  const focusRequest = useFocusRequest(view)
  const textSize = useTextSize(view.kind)

  const title = pageTitle(view.kind, view.key, locale, weekRule)
  const subtitle = pageSubtitle(view.kind, view.key, locale)
  // The heading is only the weekday for a day: the section is named by the whole date.
  const label = pageLabel(view.kind, view.key, locale, weekRule)

  return (
    <section
      className="page"
      aria-label={label}
      aria-current={view.selected || undefined}
      data-page-kind={view.kind}
      data-page-key={view.key}
      data-text-size={textSize}
    >
      <header className="page-header">
        <h2>{title}</h2>
        <p className="page-subtitle">{subtitle}</p>
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
      </header>
      {pageKey !== undefined && (
        <EditablePage
          key={`${view.kind}/${pageKey}`}
          view={{ ...view, key: pageKey }}
          label={label}
          focusRequest={focusRequest}
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

function EditablePage({
  view,
  label,
  focusRequest,
}: {
  view: NoteView
  label: string
  focusRequest: { id: number; done: () => void } | undefined
}) {
  const document = useNoteDocument(view.kind, view.key)
  const { weekRule } = usePlannerContext()
  const { kind, key } = view
  // Where the cursor was when this page was last used on this device (never sent to the server).
  const [recalled] = useState(() => recallPosition(loadPositions(browserStorage), { kind, key }))
  const rememberSelection = useCallback(
    (selection: PageSelection) => {
      const positions = loadPositions(browserStorage)
      savePositions(browserStorage, rememberPosition(positions, { kind, key }, selection))
    },
    [kind, key],
  )
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
          initialSelection={placeSelection(recalled, document.text.length)}
          onSelectionChange={rememberSelection}
          focusRequest={focusRequest}
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
