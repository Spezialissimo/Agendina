import type { NoteKind, Template } from '@agendina/contract'
import { weekNumber, type DayKey, type MergeChunk } from '@agendina/core'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useApi, useLocale } from '../app/AppProviders.tsx'
import { ConflictResolver } from '../editor/ConflictResolver.tsx'
import { PageEditor } from '../editor/PageEditor.tsx'
import { usePlannerContext } from '../planner/PlannerContext.tsx'
import { ChevronDownIcon } from '../app/icons.tsx'
import { MonthGrid, monthOf, WeekGrid } from '../planner/MonthPicker.tsx'
import { pageLabel, pageSubtitle } from '../planner/weeks.ts'
import { applyTemplate, savePage, type PageConflict } from './applyTemplate.ts'
import { templateForQueryKey, templateQueryKey } from './useTemplate.ts'

interface Props {
  kind: NoteKind
  /** The template as loaded: null if there is none yet. */
  template: Template | null
  /** The first page the change is applied to (its view key), at first the selected one. */
  from: DayKey
  /** Back to the pages, saved or not. */
  onClose: () => void
}

type Phase =
  | { type: 'editing' }
  | { type: 'saving' }
  | { type: 'template-conflict'; current: Template; chunks: MergeChunk[] }
  | { type: 'pages'; next: Template; conflicts: PageConflict[] }

const PAGE_CLASH_TEXTS = {
  hint: 'This page and the template change touch the same lines. Choose what to keep.',
  mine: 'Keep this page’s version',
  theirs: 'Keep the template’s version',
  discard: 'Leave this page as it is',
}

/**
 * Edits the day or week template, then applies the change from a chosen page on (ADR 0008): the
 * selected page by default, or any day or week picked in the calendar of the save button.
 */
export function TemplateEditor({ kind, template, from: selected, onClose }: Props) {
  const api = useApi()
  const queryClient = useQueryClient()
  const locale = useLocale()
  const { weekRule } = usePlannerContext()
  const titleId = useId()
  const [text, setText] = useState(template?.content ?? '')
  const [from, setFrom] = useState(selected)
  const [picking, setPicking] = useState(false)
  const [phase, setPhase] = useState<Phase>({ type: 'editing' })
  const [failed, setFailed] = useState(false)
  const label = `${kind === 'day' ? 'Day' : 'Week'} template`
  const fromLabel =
    kind === 'day'
      ? pageSubtitle('day', from, locale)
      : `week ${String(weekNumber(from, weekRule).week)}`

  const refreshPages = async () => {
    await queryClient.invalidateQueries({ queryKey: ['note', kind] })
    await queryClient.invalidateQueries({ queryKey: ['notes'] })
  }

  const save = async (content: string, baseRevision: number) => {
    setFailed(false)
    setPhase({ type: 'saving' })
    try {
      await saveAndApply(content, baseRevision)
    } catch {
      setFailed(true)
      setPhase({ type: 'editing' })
    }
  }

  const saveAndApply = async (content: string, baseRevision: number) => {
    const result = await api.saveTemplate(kind, content, baseRevision, from)
    if (result.status === 'conflict') {
      setPhase({ type: 'template-conflict', current: result.current, chunks: result.chunks })
      return
    }
    const next = result.template
    queryClient.setQueryData(templateQueryKey(kind), next)
    // Live updates skip a revision this tab already has: the pages nobody wrote are reloaded here.
    await queryClient.invalidateQueries({ queryKey: templateForQueryKey(kind) })
    const applied = await applyTemplate(api, kind, from, next)
    await refreshPages()
    if (applied.conflicts.length === 0) onClose()
    else setPhase({ type: 'pages', next, conflicts: applied.conflicts })
  }

  if (phase.type === 'template-conflict') {
    return (
      <ConflictResolver
        chunks={phase.chunks}
        texts={{
          title: 'The template changed elsewhere',
          hint: 'Another device saved changes to the same lines of the template. Choose what to keep.',
        }}
        onResolve={(resolved) => void save(resolved, phase.current.revision)}
        onDiscard={() => {
          queryClient.setQueryData(templateQueryKey(kind), phase.current)
          onClose()
        }}
      />
    )
  }

  if (phase.type === 'pages') {
    const { next, conflicts } = phase
    const done = (key: DayKey, replacement?: PageConflict) => {
      const remaining = conflicts.flatMap((c) =>
        c.key !== key ? [c] : replacement === undefined ? [] : [replacement],
      )
      if (remaining.length === 0) {
        void refreshPages()
        onClose()
      } else {
        setPhase({ ...phase, conflicts: remaining })
      }
    }
    const count = conflicts.length
    return (
      <section className="template-pages" aria-labelledby={titleId}>
        <h3 id={titleId}>
          {count === 1 ? '1 page needs a decision' : `${String(count)} pages need a decision`}
        </h3>
        <p className="hint">
          The template was saved. On these pages you changed the same lines as the template.
        </p>
        {conflicts.map((conflict) => (
          <ConflictResolver
            key={`${conflict.key}@${String(conflict.revision)}`}
            chunks={conflict.chunks}
            texts={{ ...PAGE_CLASH_TEXTS, title: pageLabel(kind, conflict.key, locale, weekRule) }}
            onResolve={(resolved) => {
              void savePage(api, kind, conflict, conflict.base, resolved, next).then((again) => {
                done(conflict.key, again)
              })
            }}
            onDiscard={() => {
              done(conflict.key)
            }}
          />
        ))}
      </section>
    )
  }

  return (
    <section className="template-editor" aria-labelledby={titleId}>
      <h3 id={titleId}>{label}</h3>
      <p className="hint">
        New {kind} pages start from this. Saving also updates the pages made from the template, from
        the {kind} you apply it from on; earlier pages stay as they are.
      </p>
      <PageEditor
        label={label}
        value={text}
        onChange={setText}
        weekRule={weekRule}
        initialSelection={{ anchor: text.length, head: text.length }}
        autoFocus
      />
      {failed && (
        <p role="alert">The template could not be saved. Check your connection and try again.</p>
      )}
      <div className="conflict-actions">
        <button
          type="button"
          className="link"
          onClick={() => {
            onClose()
          }}
        >
          Cancel
        </button>
        <div className="split-button">
          <button
            type="button"
            className="primary"
            disabled={phase.type === 'saving'}
            onClick={() => void save(text, template?.revision ?? 0)}
          >
            Save and apply from {fromLabel}
          </button>
          <button
            type="button"
            className="primary"
            aria-label={`Choose the first ${kind}`}
            title={`Choose the first ${kind}`}
            aria-expanded={picking}
            disabled={phase.type === 'saving'}
            onClick={() => {
              setPicking(!picking)
            }}
          >
            <ChevronDownIcon />
          </button>
          {picking && (
            <ApplyFrom
              kind={kind}
              from={from}
              onPick={(day) => {
                setFrom(day)
                setPicking(false)
              }}
              onClose={() => {
                setPicking(false)
              }}
            />
          )}
        </div>
      </div>
    </section>
  )
}

/** The calendar of the save button: picks the first day, or the first week (a row). */
function ApplyFrom({
  kind,
  from,
  onPick,
  onClose,
}: {
  kind: NoteKind
  from: DayKey
  onPick: (day: DayKey) => void
  onClose: () => void
}) {
  const { weekRule } = usePlannerContext()
  const [month, setMonth] = useState(monthOf(from))
  return (
    <div
      className="month-calendar template-apply-from"
      role="group"
      aria-label={`Apply from ${kind === 'day' ? 'day' : 'week'}`}
      onKeyDown={(event) => {
        // Closes the calendar only, not the pop-up around it.
        if (event.key !== 'Escape') return
        event.preventDefault()
        onClose()
      }}
    >
      {kind === 'day' ? (
        <MonthGrid focus={from} rule={weekRule} month={month} setMonth={setMonth} onPick={onPick} />
      ) : (
        <WeekGrid week={from} rule={weekRule} month={month} setMonth={setMonth} onPick={onPick} />
      )}
    </div>
  )
}
