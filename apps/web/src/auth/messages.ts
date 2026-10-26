import { ApiError } from '../api/client.ts'

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  too_many_attempts: 'Too many attempts. Try again in 15 minutes.',
  email_taken: 'An account with this email already exists.',
  signup_closed: 'Signup is closed on this Agendina.',
}

export function authErrorMessage(error: unknown): string {
  return (
    (error instanceof ApiError ? MESSAGES[error.code] : undefined) ??
    'Something went wrong. Please try again.'
  )
}
