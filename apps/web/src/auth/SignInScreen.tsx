import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type SubmitEvent } from 'react'
import { useApi } from '../app/AppProviders.tsx'
import { AccountForm, Field } from './AccountForm.tsx'
import { AUTH_QUERY } from './AuthGate.tsx'
import { authErrorMessage } from './messages.ts'

export function SignInScreen({ signupOpen }: { signupOpen: boolean }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => api.login({ email, password }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AUTH_QUERY }),
  })

  if (creating) {
    return (
      <AccountForm
        mode="signup"
        onCancel={() => {
          setCreating(false)
        }}
      />
    )
  }

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    login.mutate()
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>Agendina</h1>
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {login.isError && <p role="alert">{authErrorMessage(login.error)}</p>}
        <button type="submit" className="primary" disabled={login.isPending}>
          Sign in
        </button>
        {signupOpen && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setCreating(true)
            }}
          >
            Create an account
          </button>
        )}
      </form>
    </main>
  )
}
