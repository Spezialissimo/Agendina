import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Platform } from '@agendina/core'
import { Api } from '../api/client.ts'
import { UI_LOCALE } from '../locale.ts'
import { dayKeyFromDate } from '../time.ts'

interface Environment {
  api: Api
  /** The clock; injectable so tests control "today". */
  now: () => Date
  locale: string
  /** Decides whether `Mod` means Cmd or Ctrl. */
  platform: Platform
  /**
   * The router's current path, read at call time. React renders a navigation slightly later, so
   * handlers that run right after one (e.g. a shortcut pressed just after clicking a day) must
   * read this instead of rendered props.
   */
  currentPath: () => string
}

const EnvironmentContext = createContext<Environment | undefined>(undefined)

export function AppProviders({
  api = new Api(),
  now = () => new Date(),
  locale = UI_LOCALE,
  platform = detectPlatform(),
  currentPath = () => window.location.pathname,
  children,
}: Partial<Environment> & { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  )
  const [environment] = useState<Environment>(() => ({ api, now, locale, platform, currentPath }))
  return (
    <EnvironmentContext value={environment}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </EnvironmentContext>
  )
}

function useEnvironment(): Environment {
  const environment = useContext(EnvironmentContext)
  if (environment === undefined) throw new Error('Missing <AppProviders>')
  return environment
}

export const useApi = () => useEnvironment().api
export const useLocale = () => useEnvironment().locale
export const useToday = () => dayKeyFromDate(useEnvironment().now())
export const usePlatform = () => useEnvironment().platform
export const useCurrentPath = () => useEnvironment().currentPath

function detectPlatform(): Platform {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? 'mac' : 'other'
}
