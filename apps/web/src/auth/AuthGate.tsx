import { useQuery } from '@tanstack/react-query'
import { Outlet } from 'react-router'
import { useApi } from '../app/AppProviders.tsx'
import { AccountForm } from './AccountForm.tsx'
import { SignInScreen } from './SignInScreen.tsx'

export const AUTH_QUERY = ['auth'] as const

export function useAuthState() {
  const api = useApi()
  return useQuery({ queryKey: AUTH_QUERY, queryFn: () => api.authState() })
}

/** Shows first-run setup or sign-in until there is a session, then the requested page. */
export function AuthGate() {
  const auth = useAuthState()

  if (auth.isPending) return <p className="splash">Agendina</p>
  if (auth.isError) {
    return (
      <main className="auth">
        <p role="alert">Agendina could not reach its server.</p>
        <button type="button" onClick={() => void auth.refetch()}>
          Try again
        </button>
      </main>
    )
  }
  if (auth.data.setupRequired) return <AccountForm mode="setup" />
  if (auth.data.user === null) return <SignInScreen signupOpen={auth.data.signupOpen} />
  return <Outlet />
}
