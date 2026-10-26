import type { DatabaseHandle } from '@agendina/db'
import { createApp } from './app.ts'

export const PASSWORD = 'correct horse battery staple'

interface RequestOptions {
  method?: string
  body?: unknown
  cookie?: string | undefined
  headers?: Record<string, string>
}

/** An app on a test database, with helpers to call the API like a browser would. */
export function createTestServer(handle: DatabaseHandle, options: { now?: () => Date } = {}) {
  const app = createApp({ version: 'test', db: handle.db, ...options })

  const request = (
    path: string,
    { method = 'GET', body, cookie, headers = {} }: RequestOptions = {},
  ) =>
    app.request(path, {
      method,
      headers: {
        // Browsers always send Origin on POST/PUT/DELETE; the CSRF check relies on it.
        ...(method === 'GET' ? {} : { origin: 'http://localhost' }),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie === undefined ? {} : { cookie }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

  /** Signs up and returns the session cookie (`name=value`). */
  const signup = async (email = 'admin@example.com', password = PASSWORD): Promise<string> => {
    const res = await request('/api/auth/signup', { method: 'POST', body: { email, password } })
    if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${await res.text()}`)
    return sessionCookie(res)
  }

  return { app, db: handle.db, request, signup }
}

/** The `name=value` part of the session cookie set by a response. */
export function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie') ?? ''
  const match = /agendina_session=[^;]*/.exec(header)
  if (match === null) throw new Error(`no session cookie in ${JSON.stringify(header)}`)
  return match[0]
}
