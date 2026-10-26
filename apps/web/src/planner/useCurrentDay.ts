import { isDayKey, type DayKey } from '@agendina/core'
import { useCallback } from 'react'
import { useCurrentPath } from '../app/AppProviders.tsx'

/**
 * Returns a function giving the day open right now, from the router's location rather than from
 * the last render: a shortcut or button pressed right after a navigation acts on the new day.
 */
export function useCurrentDay(rendered: DayKey): () => DayKey {
  const currentPath = useCurrentPath()
  return useCallback(() => {
    const day = /^\/day\/([^/]+)$/.exec(currentPath())?.[1]
    return day !== undefined && isDayKey(day) ? day : rendered
  }, [currentPath, rendered])
}
