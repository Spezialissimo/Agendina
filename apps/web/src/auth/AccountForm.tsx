import { Email, Password } from '@agendina/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type SubmitEvent } from 'react'
import { useApi } from '../app/AppProviders.tsx'
import { AUTH_QUERY } from './AuthGate.tsx'
import { authErrorMessage } from './messages.ts'

interface Props {
  /** `setup` creates the first (admin) account of a new instance. */
  mode: 'setup' | 'signup'
  onCancel?: () => void
}

export function AccountForm({ mode, onCancel }: Props) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; repeat?: string }>({})
  const signup = useMutation({
    mutationFn: () => api.signup({ email, password }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AUTH_QUERY }),
  })

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = {
      ...(Email.safeParse(email).success ? {} : { email: 'Enter a valid email address.' }),
      ...(Password.safeParse(password).success ? {} : { password: 'Use at least 10 characters.' }),
      ...(password === repeat ? {} : { repeat: 'The passwords do not match.' }),
    }
    setErrors(found)
    if (Object.keys(found).length === 0) signup.mutate()
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>{mode === 'setup' ? 'Welcome to Agendina' : 'Create your account'}</h1>
        {mode === 'setup' && (
          <p className="hint">Create the first account. It will manage this Agendina.</p>
        )}
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={errors.email}
          autoComplete="email"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="new-password"
        />
        <Field
          label="Repeat password"
          type="password"
          value={repeat}
          onChange={setRepeat}
          error={errors.repeat}
          autoComplete="new-password"
        />
        {signup.isError && <p role="alert">{authErrorMessage(signup.error)}</p>}
        <button type="submit" className="primary" disabled={signup.isPending}>
          Create account
        </button>
        {onCancel !== undefined && (
          <button type="button" className="link" onClick={onCancel}>
            Back to sign in
          </button>
        )}
      </form>
    </main>
  )
}

interface FieldProps {
  label: string
  type: 'email' | 'password'
  value: string
  onChange: (value: string) => void
  error?: string | undefined
  autoComplete: string
}

export function Field({ label, type, value, onChange, error, autoComplete }: FieldProps) {
  const id = `field-${label.toLowerCase().replaceAll(' ', '-')}`
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
      {error !== undefined && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}
