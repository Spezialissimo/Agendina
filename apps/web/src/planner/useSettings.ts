import type { UserSettings } from '@agendina/contract'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../app/AppProviders.tsx'

const SETTINGS_QUERY = ['settings'] as const
const SAVE_DELAY_MS = 400
const RETRY_DELAY_MS = 5000

/**
 * The user's settings, and an `update` that applies immediately and saves shortly after. A change
 * that could not be saved is kept and retried (`saveFailed` meanwhile), also when the connection
 * comes back.
 */
export function useSettings() {
  const api = useApi()
  const queryClient = useQueryClient()
  const loaded = useQuery({ queryKey: SETTINGS_QUERY, queryFn: () => api.settings() })
  // The change not saved yet. It is shown instead of the loaded settings, so that settings
  // fetched again meanwhile (e.g. on window focus) do not undo it on screen.
  const [unsaved, setUnsaved] = useState<UserSettings | undefined>(undefined)
  const [saveFailed, setSaveFailed] = useState(false)
  const latest = useRef<UserSettings | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /** Saves the unsaved change right away. Never rejects: a failure is retried later. */
  const flush = useCallback(
    async ({ keepalive = false }: { keepalive?: boolean } = {}): Promise<void> => {
      clearTimeout(timer.current)
      timer.current = undefined
      const settings = latest.current
      if (settings === undefined) return
      try {
        const saved = await api.saveSettings(settings, { keepalive })
        // Changed again meanwhile: that change has its own save coming.
        if (latest.current !== settings) return
        latest.current = undefined
        queryClient.setQueryData(SETTINGS_QUERY, saved)
        setUnsaved(undefined)
        setSaveFailed(false)
      } catch {
        if (latest.current !== settings) return
        setSaveFailed(true)
      }
    },
    [api, queryClient],
  )

  // A change made just before leaving the planner or closing the page is still saved.
  useEffect(() => {
    const pageHide = () => void flush({ keepalive: true })
    const online = () => void flush()
    window.addEventListener('pagehide', pageHide)
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('pagehide', pageHide)
      window.removeEventListener('online', online)
      void flush({ keepalive: true })
    }
  }, [flush])

  useEffect(() => {
    if (!saveFailed) return
    const retry = setInterval(() => void flush(), RETRY_DELAY_MS)
    return () => {
      clearInterval(retry)
    }
  }, [saveFailed, flush])

  const update = useCallback(
    (next: UserSettings) => {
      latest.current = next
      setUnsaved(next)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
    [flush],
  )

  return { settings: unsaved ?? loaded.data, isError: loaded.isError, saveFailed, update, flush }
}
