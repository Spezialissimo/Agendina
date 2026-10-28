import type { NoteKind, Template } from '@agendina/contract'
import type { DayKey, MergeChunk } from '@agendina/core'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useApi, useLocale } from '../app/AppProviders.tsx'
import { ConflictResolver } from '../editor/ConflictResolver.tsx'
import { PageEditor } from '../editor/PageEditor.tsx'
import { usePlannerContext } from '../planner/PlannerContext.tsx'
import { pageTitle } from '../planner/weeks.ts'
import { applyTemplate, savePage, type PageConflict } from './applyTemplate.ts'
import { templateQueryKey } from './useTemplate.ts'

interface Props {
  kind: NoteKind
  /** The page the template is edited from: it and every later page made from it are updated. */
  pageKey: DayKey
  /** The template as loaded (null if there is none yet) and the page's text to start one from. */
  template: Template | null
  pageText: string
  /** Back to the page, with a summary of what changed (undefined when nothing was saved). */
  onClose: (notice?: string) => void
}

type Phase =
  | { type: 'editing' }
  | { type: 'saving' }
  | { type: 'template-conflict'; current: Template; chunks: MergeChunk[] }
  | { type: 'pages'; next: Template; conflicts: PageConflict[]; notice: string }

const PAGE_CLASH_TEXTS = {
  hint: 'This page and the template change touch the same lines. Choose what to keep.',
  mine: 'Keep this page’s version',
  theirs: 'Keep the template’s version',
  discard: 'Leave this page as it is',
}

/** Edits the day or week template from a page, then applies the change (ADR 0008). */
export function TemplateEditor({ kind, pageKey, template, pageText, onClose }: Props) {
  const api = useApi()
  const queryClient = useQueryClient()
  const locale = useLocale()
  const { weekRule } = usePlannerContext()
  const titleId = useId()
  // A first template starts as a copy of this page: the usual way to make one.
  const [text, setText] = useState(template?.content ?? pageText)
  const [phase, setPhase] = useState<Phase>({ type: 'editing' })
  const [failed, setFailed] = useState(false)
  const label = `${kind === 'day' ? 'Day' : 'Week'} template`

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
    const result = await api.saveTemplate(kind, content, baseRevision)
    if (result.status === 'conflict') {
      setPhase({ type: 'template-conflict', current: result.current, chunks: result.chunks })
      return
    }
    const next = result.template
    queryClient.setQueryData(templateQueryKey(kind), next)
    if (template === null) {
      // The first template was copied from this page: link the page to it, so later template
      // changes reach it too.
      const page = await api.getNote(kind, pageKey)
      if (page !== null && page.templateRevision === null) {
        await api.saveNote(kind, pageKey, page.content, page.revision, { templateRevision: 1 })
      }
    }
    const applied = await applyTemplate(api, kind, pageKey, next)
    await refreshPages()
    const notice = summary(applied.updated)
    if (applied.conflicts.length === 0) onClose(notice)
    else setPhase({ type: 'pages', next, conflicts: applied.conflicts, notice })
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
    const { next, conflicts, notice } = phase
    const done = (key: DayKey, replacement?: PageConflict) => {
      const remaining = conflicts.flatMap((c) =>
        c.key !== key ? [c] : replacement === undefined ? [] : [replacement],
      )
      if (remaining.length === 0) {
        void refreshPages()
        onClose(notice)
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
            texts={{ ...PAGE_CLASH_TEXTS, title: pageTitle(kind, conflict.key, locale, weekRule) }}
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
        New {kind} pages start from this. Saving also updates this page and the later pages made
        from the template; earlier pages stay as they are.
      </p>
      <PageEditor label={label} value={text} onChange={setText} weekRule={weekRule} />
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
        <button
          type="button"
          className="primary"
          disabled={phase.type === 'saving'}
          onClick={() => void save(text, template?.revision ?? 0)}
        >
          Save template
        </button>
      </div>
    </section>
  )
}

function summary(updated: number): string {
  if (updated === 0) return 'Template saved.'
  return `Template saved, ${String(updated)} ${updated === 1 ? 'page' : 'pages'} updated.`
}
