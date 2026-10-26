import type { UserSettings } from '@agendina/contract'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { useApi } from '../app/AppProviders.tsx'

export const SETTINGS_QUERY = ['settings'] as const
const SAVE_DELAY_MS = 400

/** The user's settings, and an `update` that applies immediately and saves shortly after. */
export function useSettings() {
  const api = useApi()
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: SETTINGS_QUERY, queryFn: () => api.settings() })
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      clearTimeout(pending.current)
    },
    [],
  )

  const update = useCallback(
    (next: UserSettings) => {
      queryClient.setQueryData(SETTINGS_QUERY, next)
      clearTimeout(pending.current)
      pending.current = setTimeout(() => {
        void api.saveSettings(next)
      }, SAVE_DELAY_MS)
    },
    [api, queryClient],
  )

  return { settings: settings.data, isError: settings.isError, update }
}
