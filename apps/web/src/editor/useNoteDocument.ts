import type { Note, NoteKind } from '@agendina/contract'
import { merge3, type MergeChunk } from '@agendina/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../app/AppProviders.tsx'
import { useTemplateFor } from '../templates/useTemplate.ts'

export type SaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'offline' | 'conflict'

const SAVE_DELAY_MS = 700
const RETRY_DELAYS_MS = [1000, 3000, 10_000, 30_000]

interface Sync {
  /** The revision the local text is based on (0 before the note exists). */
  base: number
  /** The content of `base`, i.e. what the server has; the template for a page not written yet. */
  saved: string
  /** The template revision shown on a page not written yet; recorded when it is first saved. */
  templateRevision: number | undefined
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
  })
  const template = useTemplateFor(kind, key)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<SaveStatus>('loading')
  const [conflict, setConflict] = useState<{ current: Note; chunks: MergeChunk[] } | undefined>(
    undefined,
  )
  const sync = useRef<Sync>({
    base: 0,
    saved: '',
    templateRevision: undefined,
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

  // Load the note (or the template for a page not written yet), and later adopt newer revisions
  // from the server while the page is clean. Also checked again when the page becomes clean (the
  // status turns to saved): a newer revision may have arrived while it was not.
  useEffect(() => {
    const s = sync.current
    if (note.data === undefined || template.data === undefined) return
    const fromTemplate = note.data === null ? (template.data ?? undefined) : undefined
    const revision = note.data?.revision ?? 0
    const content = note.data?.content ?? fromTemplate?.content ?? ''
    const clean = s.text === s.saved && !s.inflight
    const newTemplate =
      revision === 0 && s.base === 0 && fromTemplate?.revision !== s.templateRevision
    if (!s.loaded || (clean && (revision > s.base || newTemplate))) {
      s.loaded = true
      s.base = revision
      s.saved = content
      s.templateRevision = fromTemplate?.revision
      show(content)
      setStatus('saved')
    }
  }, [note.data, template.data, status])

  // Retries and follow-up saves call the latest `save` through this ref.
  const saveLater = useRef<() => void>(() => undefined)

  /** Takes `note` as the new base: the user's text now builds on top of it. */
  const adopt = (current: Note) => {
    const s = sync.current
    s.base = current.revision
    s.saved = current.content
    s.retries = 0
    // A late answer must not replace a newer revision fetched meanwhile; the page adopts that one
    // once it is clean.
    queryClient.setQueryData<Note | null>(queryKey, (cached) =>
      cached != null && cached.revision > current.revision ? cached : current,
    )
  }

  const save = useCallback(
    async ({ keepalive = false }: { keepalive?: boolean } = {}): Promise<void> => {
      const s = sync.current
      clearTimeout(s.timer)
      if (!s.loaded || s.inflight || s.conflicted) return
      if (s.text === s.saved) {
        // Typed and erased again: nothing to save, and the page is clean once more.
        setStatus('saved')
        return
      }
      s.inflight = true
      const sent = s.text
      setStatus('saving')
      try {
        const result = await api.saveNote(kind, key, sent, s.base, {
          keepalive,
          templateRevision: s.base === 0 ? s.templateRevision : undefined,
        })
        if (result.status === 'conflict') {
          // Re-merge against what is on screen now (the user may have typed since sending).
          const merged = merge3(s.saved, s.text, result.current.content)
          adopt(result.current)
          if (merged.status === 'clean') {
            show(merged.text)
          } else {
            s.conflicted = true
            setConflict({ current: result.current, chunks: merged.chunks })
            setStatus('conflict')
            return
          }
        } else {
          adopt(result.note)
          if (kind === 'day') void queryClient.invalidateQueries({ queryKey: ['notes'] })
          // Merged with changes from elsewhere: show them, unless the user typed meanwhile.
          if (s.text === sent && result.note.content !== sent) show(result.note.content)
        }
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

  /** Ends a conflict with `resolved` as the page text (saved on top of the other version). */
  const resolve = useCallback((resolved: string) => {
    const s = sync.current
    s.conflicted = false
    setConflict(undefined)
    show(resolved)
    if (resolved === s.saved) {
      setStatus('saved')
    } else {
      setStatus('dirty')
      saveLater.current()
    }
  }, [])

  /** Ends a conflict by taking the other version as it is. */
  const discard = useCallback(() => {
    const s = sync.current
    s.conflicted = false
    setConflict(undefined)
    show(s.saved)
    setStatus('saved')
  }, [])

  const isError = note.isError || template.isError
  return { text, status, conflict, edit, resolve, discard, isError }
}
