import type { UserSettings } from '@agendina/contract'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { useApi } from '../app/AppProviders.tsx'

const SETTINGS_QUERY = ['settings'] as const
const SAVE_DELAY_MS = 400

/** The user's settings, and an `update` that applies immediately and saves shortly after. */
export function useSettings() {
  const api = useApi()
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: SETTINGS_QUERY, queryFn: () => api.settings() })
  const pending = useRef<{ settings: UserSettings; timer: ReturnType<typeof setTimeout> }>(
    undefined,
  )

  /** Sends the change waiting for its delay right away. */
  const flush = useCallback(
    ({ keepalive = false }: { keepalive?: boolean } = {}) => {
      if (pending.current === undefined) return
      clearTimeout(pending.current.timer)
      const { settings } = pending.current
      pending.current = undefined
      api.saveSettings(settings, { keepalive }).catch(() => {
        console.warn('Settings could not be saved')
      })
    },
    [api],
  )

  // A change made just before leaving the planner or closing the page is still saved.
  useEffect(() => {
    const pageHide = () => {
      flush({ keepalive: true })
    }
    window.addEventListener('pagehide', pageHide)
    return () => {
      window.removeEventListener('pagehide', pageHide)
      flush({ keepalive: true })
    }
  }, [flush])

  const update = useCallback(
    (next: UserSettings) => {
      queryClient.setQueryData(SETTINGS_QUERY, next)
      clearTimeout(pending.current?.timer)
      pending.current = {
        settings: next,
        timer: setTimeout(() => {
          flush()
        }, SAVE_DELAY_MS),
      }
    },
    [queryClient, flush],
  )

  return { settings: settings.data, isError: settings.isError, update }
}
