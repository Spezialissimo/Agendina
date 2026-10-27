import type { NoteKind } from '@agendina/contract'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../app/AppProviders.tsx'

export const templateQueryKey = (kind: NoteKind) => ['template', kind]

/** The template for `kind` pages: `null` when there is none, `undefined` while loading. */
export function useTemplate(kind: NoteKind) {
  const api = useApi()
  return useQuery({
    queryKey: templateQueryKey(kind),
    queryFn: () => api.template(kind),
    refetchOnWindowFocus: true,
  })
}
