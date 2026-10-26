import type { Note, NoteKind } from '@agendina/contract'
import type { MergeChunk } from '@agendina/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../app/AppProviders.tsx'

export type SaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'offline' | 'conflict'

const SAVE_DELAY_MS = 700
const RETRY_DELAYS_MS = [1000, 3000, 10_000, 30_000]

interface Sync {
  /** The revision the local text is based on (0 before the note exists). */
  base: number
  /** The content of `base`, i.e. what the server has. */
  saved: string
  /** What the user sees. */
  text: string
  loaded: boolean
  inflight: boolean
  conflicted: boolean
  retries: number
  timer: ReturnType<typeof setTimeout> | undefined
}

/**
 * One page's text, kept in sync with the server: autosaves shortly after typing, merges in
 * changes saved elsewhere, and never overwrites text typed after a save was sent.
 */
export function useNoteDocument(kind: NoteKind, key: string) {
  const api = useApi()
  const queryClient = useQueryClient()
  const queryKey = ['note', kind, key]
  const note = useQuery({
    queryKey,
    queryFn: () => api.getNote(kind, key),
    refetchOnWindowFocus: true,
  })
  const [text, setText] = useState('')
  const [status, setStatus] = useState<SaveStatus>('loading')
  const [conflict, setConflict] = useState<{ current: Note; chunks: MergeChunk[] } | undefined>(
    undefined,
  )
  const sync = useRef<Sync>({
    base: 0,
    saved: '',
    text: '',
    loaded: false,
    inflight: false,
    conflicted: false,
    retries: 0,
    timer: undefined,
  })

  const show = (value: string) => {
    sync.current.text = value
    setText(value)
  }

  // Load the note, and later adopt newer revisions from the server while the page is clean.
  useEffect(() => {
    const s = sync.current
    if (note.data === undefined) return
    const revision = note.data?.revision ?? 0
    const content = note.data?.content ?? ''
    const clean = s.text === s.saved && !s.inflight
    if (!s.loaded || (clean && revision > s.base)) {
      s.loaded = true
      s.base = revision
      s.saved = content
      show(content)
      setStatus('saved')
    }
  }, [note.data])

  // Retries and follow-up saves call the latest `save` through this ref.
  const saveLater = useRef<() => void>(() => undefined)

  const save = useCallback(
    async ({ keepalive = false }: { keepalive?: boolean } = {}): Promise<void> => {
      const s = sync.current
      clearTimeout(s.timer)
      if (!s.loaded || s.inflight || s.conflicted || s.text === s.saved) return
      s.inflight = true
      const sent = s.text
      setStatus('saving')
      try {
        const result = await api.saveNote(kind, key, sent, s.base, { keepalive })
        if (result.status === 'conflict') {
          s.conflicted = true
          setConflict({ current: result.current, chunks: result.chunks })
          setStatus('conflict')
          return
        }
        s.base = result.note.revision
        s.saved = result.note.content
        s.retries = 0
        queryClient.setQueryData(queryKey, result.note)
        if (kind === 'day') void queryClient.invalidateQueries({ queryKey: ['notes'] })
        // Merged with changes from elsewhere: show them, unless the user typed meanwhile.
        if (s.text === sent && result.note.content !== sent) show(result.note.content)
      } catch {
        setStatus('offline')
        const delay = RETRY_DELAYS_MS[Math.min(s.retries, RETRY_DELAYS_MS.length - 1)]
        s.retries += 1
        s.timer = setTimeout(() => {
          saveLater.current()
        }, delay)
        return
      } finally {
        s.inflight = false
      }
      if (s.text !== s.saved) saveLater.current()
      else setStatus('saved')
    },
    // queryKey is derived from kind and key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, kind, key, queryClient],
  )

  useEffect(() => {
    saveLater.current = () => void save()
  }, [save])

  const edit = useCallback(
    (value: string) => {
      const s = sync.current
      show(value)
      if (s.conflicted) return
      setStatus(s.inflight ? 'saving' : 'dirty')
      clearTimeout(s.timer)
      s.timer = setTimeout(() => void save(), SAVE_DELAY_MS)
    },
    [save],
  )

  // Save right away when coming back online, when leaving the page, and warn before closing it.
  useEffect(() => {
    const s = sync.current
    const online = () => void save()
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (s.text !== s.saved && !s.conflicted) {
        void save({ keepalive: true })
        event.preventDefault()
      }
    }
    window.addEventListener('online', online)
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('beforeunload', beforeUnload)
      void save({ keepalive: true })
    }
  }, [save])

  return { text, status, conflict, edit, isError: note.isError }
}
