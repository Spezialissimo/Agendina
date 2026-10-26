import { compareDays, type DayKey } from './calendar.ts'
import { merge3, type MergeChunk } from './merge.ts'

export interface TemplatedPage {
  key: DayKey
  content: string
  /** The template revision the page was created from; undefined if not created from a template. */
  templateRevision?: number | undefined
}

export interface TemplatePropagation {
  /** Every revision of the template, by revision number. */
  history: Record<number, string>
  next: { revision: number; content: string }
  /** The page the template was edited from: it and every later page are updated. */
  from: DayKey
  pages: TemplatedPage[]
}

export interface PropagationResult {
  updated: { key: DayKey; content: string; templateRevision: number }[]
  /** Pages left unchanged until the user resolves these chunks. */
  conflicts: { key: DayKey; chunks: MergeChunk[] }[]
}

/**
 * Applies a template change to the page it was edited from and every later page, with a
 * three-way merge per page: base = the template revision the page was created from,
 * mine = the page, theirs = the new template. Earlier pages are never touched.
 */
export function propagateTemplate({
  history,
  next,
  from,
  pages,
}: TemplatePropagation): PropagationResult {
  const result: PropagationResult = { updated: [], conflicts: [] }

  for (const page of pages) {
    if (compareDays(page.key, from) < 0) continue
    if (page.templateRevision === undefined || page.templateRevision === next.revision) continue

    const base = history[page.templateRevision]
    if (base === undefined) {
      throw new Error(
        `Page ${page.key} refers to unknown template revision ${page.templateRevision}`,
      )
    }

    const merged = merge3(base, page.content, next.content)
    if (merged.status === 'clean') {
      result.updated.push({ key: page.key, content: merged.text, templateRevision: next.revision })
    } else {
      result.conflicts.push({ key: page.key, chunks: merged.chunks })
    }
  }
  return result
}
