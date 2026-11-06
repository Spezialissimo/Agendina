import { NoteKind, type NoteChange } from '@agendina/contract'
import { compareDays } from '@agendina/core'
import { focusManager, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useApi } from '../app/AppProviders.tsx'
import { templateQueryKey } from '../templates/useTemplate.ts'

/** How often a visible tab asks the server what changed on other devices. */
export const POLL_INTERVAL_MS = 5000

/**
 * Keeps the pages on screen up to date with what other devices write: while the tab is visible,
 * asks the changes feed every few seconds (and right away when the tab or window comes back), then
 * reloads only the notes and templates that changed. Pages with unsaved typing are left alone by
 * `useNoteDocument`; their next save merges.
 *
 * Returns false until it knows where the feed is now. The pages load only after that, so a change
 * saved while they load is in the feed and nothing is missed.
 */
export function useLiveUpdates(): boolean {
  const api = useApi()
  const queryClient = useQueryClient()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stopped = false
    let cursor: number | undefined
    let polling = false

    const start = async () => {
      try {
        const latest = (await api.changes()).cursor
        // A poll may have started from a newer point meanwhile (the window got focus).
        cursor ??= latest
      } catch {
        // Offline at start: the first successful poll catches up on everything instead.
      }
      if (!stopped) setReady(true)
    }

    const poll = async () => {
      if (stopped || polling || document.visibilityState === 'hidden') return
      polling = true
      try {
        if (cursor === undefined) {
          cursor = (await api.changes()).cursor
          await reloadEverything(queryClient)
          return
        }
        let hasMore: boolean
        do {
          const feed = await api.changes(cursor)
          cursor = feed.cursor
          hasMore = feed.hasMore
          for (const change of feed.changes) reload(queryClient, change)
        } while (hasMore)
      } catch {
        // Offline or a server hiccup: the next poll tries again.
      } finally {
        polling = false
      }
    }

    void start()
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS)
    const catchUp = () => void poll()
    // React Query's focus manager reports the tab becoming visible again.
    const unsubscribe = focusManager.subscribe((focused) => {
      if (focused) catchUp()
    })
    window.addEventListener('focus', catchUp)
    return () => {
      stopped = true
      clearInterval(timer)
      unsubscribe()
      window.removeEventListener('focus', catchUp)
    }
  }, [api, queryClient])

  return ready
}

/** Reloads what `change` affects, unless this tab already has that revision (e.g. its own save). */
function reload(queryClient: QueryClient, change: NoteChange) {
  const upToDate = (queryKey: unknown[]) => {
    const cached = queryClient.getQueryData<{ revision: number } | null>(queryKey)
    return cached != null && cached.revision >= change.revision
  }
  if (change.kind === 'template') {
    // A template's key is the kind of page it is for.
    const kind = NoteKind.safeParse(change.key)
    if (!kind.success || upToDate(templateQueryKey(kind.data))) return
    void queryClient.invalidateQueries({ queryKey: templateQueryKey(kind.data) })
    return
  }
  const noteKey = ['note', change.kind, change.key]
  if (upToDate(noteKey)) return
  void queryClient.invalidateQueries({ queryKey: noteKey, exact: true })
  // Lists of pages in a range that includes this one: the week strip, the week page's key.
  void queryClient.invalidateQueries({
    predicate: ({ queryKey: [name, kind, from, to] }) =>
      name === 'notes' &&
      kind === change.kind &&
      typeof from === 'string' &&
      typeof to === 'string' &&
      compareDays(change.key, from) >= 0 &&
      compareDays(to, change.key) >= 0,
  })
}

function reloadEverything(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: ({ queryKey: [name] }) => name === 'note' || name === 'notes' || name === 'template',
  })
}
