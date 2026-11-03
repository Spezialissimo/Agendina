import { SaveNoteResponse } from '@agendina/contract'
import type { DatabaseHandle } from '@agendina/db'
import { afterEach, beforeEach, expect } from 'vitest'
import { createApp } from './app.ts'

export const PASSWORD = 'correct horse battery staple'

/** The fixed time the test servers run at, unless a test brings its own clock. */
export const NOW = new Date('2026-10-26T10:00:00.000Z')

interface RequestOptions {
  method?: string
  body?: unknown
  cookie?: string | undefined
  headers?: Record<string, string>
}

interface SaveNoteBody {
  content: string
  baseRevision: number
  templateRevision?: number
}

export type TestServer = ReturnType<typeof createTestServer>

/** An app on a test database, with helpers to call the API like a browser would. */
export function createTestServer(handle: DatabaseHandle, options: { now?: () => Date } = {}) {
  const app = createApp({ version: 'test', db: handle.db, ...options })

  const request = async (
    path: string,
    { method = 'GET', body, cookie, headers = {} }: RequestOptions = {},
  ): Promise<Response> =>
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

  /** PUTs a note as the user of `cookie` and expects it to be saved. */
  const saveNote = async (
    kind: string,
    key: string,
    body: SaveNoteBody,
    cookie: string,
  ): Promise<SaveNoteResponse> => {
    const res = await request(`/api/notes/${kind}/${key}`, { method: 'PUT', cookie, body })
    expect(res.status).toBe(200)
    return SaveNoteResponse.parse(await res.json())
  }

  return { request, signup, saveNote }
}

interface TestServerContext {
  handle: DatabaseHandle
  server: TestServer
}

/**
 * Gives each test a fresh database and server, closed again after the test. The fields are
 * replaced before every test, so read them inside tests and helpers, not when defining them.
 */
export function useTestServer(
  create: () => Promise<DatabaseHandle>,
  { now = () => NOW }: { now?: () => Date } = {},
): TestServerContext {
  const context = {} as TestServerContext
  beforeEach(async () => {
    context.handle = await create()
    context.server = createTestServer(context.handle, { now })
  })
  afterEach(async () => {
    await context.handle.close()
  })
  return context
}

/** Like `useTestServer`, with the admin signed up and its session cookie in `cookie`. */
export function useSignedInServer(
  create: () => Promise<DatabaseHandle>,
): TestServerContext & { cookie: string } {
  const context = useTestServer(create) as TestServerContext & { cookie: string }
  beforeEach(async () => {
    context.cookie = await context.server.signup()
  })
  return context
}

/** The `name=value` part of the session cookie set by a response. */
export function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie') ?? ''
  const match = /agendina_session=[^;]*/.exec(header)
  if (match === null) throw new Error(`no session cookie in ${JSON.stringify(header)}`)
  return match[0]
}
