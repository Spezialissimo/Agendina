import type { Note, NoteKind } from '@agendina/contract'
import { merge3, propagateTemplate, type DayKey, type MergeChunk } from '@agendina/core'
import type { Api } from '../api/client.ts'

/** A page left as it was: the user changed lines that the template change also changes. */
export interface PageConflict {
  key: DayKey
  /** The page revision the chunks were computed on. */
  revision: number
  /** The template revision the page was made from: the merge base. */
  base: string
  chunks: MergeChunk[]
}

interface Applied {
  updated: number
  conflicts: PageConflict[]
}

/**
 * Brings `from`'s page and every later page made from the template up to the `next` revision with
 * a three-way merge each (ADR 0008). Runs on the client, so the server never merges page text.
 */
export async function applyTemplate(
  api: Api,
  kind: NoteKind,
  from: DayKey,
  next: { revision: number; content: string },
): Promise<Applied> {
  const pages = await api.templatedPages(kind, from)
  const history: Record<number, string> = { [next.revision]: next.content }
  const older = new Set(pages.flatMap((page) => page.templateRevision ?? []))
  older.delete(next.revision)
  await Promise.all(
    [...older].map(async (revision) => {
      history[revision] = await api.templateRevision(kind, revision)
    }),
  )

  const result = propagateTemplate({
    history,
    next,
    from,
    pages: pages.map((page) => ({
      key: page.key,
      content: page.content,
      templateRevision: page.templateRevision ?? undefined,
    })),
  })
  const byKey = new Map(pages.map((page) => [page.key, page]))
  const baseOf = (page: Note) => history[page.templateRevision ?? next.revision] ?? ''

  const applied: Applied = { updated: 0, conflicts: [] }
  for (const conflict of result.conflicts) {
    const page = byKey.get(conflict.key)
    if (page === undefined) continue
    applied.conflicts.push({ ...conflict, revision: page.revision, base: baseOf(page) })
  }
  for (const update of result.updated) {
    const page = byKey.get(update.key)
    if (page === undefined) continue
    const outcome = await savePage(api, kind, page, baseOf(page), update.content, next)
    if (outcome === undefined) applied.updated += 1
    else applied.conflicts.push(outcome)
  }
  return applied
}

/**
 * Saves a page brought up to the template. If the page changed meanwhile on the same lines, merges
 * the template into its latest text instead; returns what still needs a decision.
 */
export async function savePage(
  api: Api,
  kind: NoteKind,
  page: Pick<Note, 'key' | 'revision'>,
  base: string,
  content: string,
  next: { revision: number; content: string },
): Promise<PageConflict | undefined> {
  const saved = await api.saveNote(kind, page.key, content, page.revision, {
    templateRevision: next.revision,
  })
  if (saved.status === 'saved') return undefined
  const merged = merge3(base, saved.current.content, next.content)
  if (merged.status === 'conflict') {
    return { key: page.key, revision: saved.current.revision, base, chunks: merged.chunks }
  }
  return savePage(api, kind, saved.current, base, merged.text, next)
}
