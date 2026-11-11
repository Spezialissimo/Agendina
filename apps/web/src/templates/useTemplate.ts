import type { NoteKind } from '@agendina/contract'
import type { DayKey } from '@agendina/core'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../app/AppProviders.tsx'

export const templateQueryKey = (kind: NoteKind) => ['template', kind]

/**
 * The queries of what pages nobody wrote yet start from: below `templateQueryKey`, so reloading
 * the template reloads them too.
 */
export const templateForQueryKey = (kind: NoteKind) => [...templateQueryKey(kind), 'for']

/**
 * The template page `key` starts from while nobody wrote it: the revision that applies to it
 * (ADR 0008), `null` when none does, `undefined` while loading.
 */
export function useTemplateFor(kind: NoteKind, key: DayKey) {
  const api = useApi()
  return useQuery({
    queryKey: [...templateForQueryKey(kind), key],
    queryFn: () => api.templateFor(kind, key),
  })
}

/** The template for `kind` pages: `null` when there is none, `undefined` while loading. */
export function useTemplate(kind: NoteKind) {
  const api = useApi()
  return useQuery({
    queryKey: templateQueryKey(kind),
    queryFn: () => api.template(kind),
  })
}
