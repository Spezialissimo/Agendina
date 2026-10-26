import { createDatabase, migrateToLatest, type Database } from '@agendina/db'
import { createApp } from '@agendina/server/app'
import type { FetchFn } from '../api/client.ts'

export const PASSWORD = 'correct horse battery staple'

export interface TestServer {
  /** A fetch that calls the real server in-process and keeps its session cookie, like a browser. */
  fetch: FetchFn
  db: Database
  /** Simulates losing the connection: fetches fail like a browser's would. */
  setOffline(offline: boolean): void
  /** Signs up through the API (the first account becomes the admin) and keeps the session. */
  signup(email?: string): Promise<void>
  close(): Promise<void>
}

/** The real API on a fresh in-memory database: web tests run against it instead of mocks. */
export async function startTestServer(options: { now?: () => Date } = {}): Promise<TestServer> {
  const handle = createDatabase('sqlite::memory:')
  await migrateToLatest(handle.db)
  const app = createApp({ version: 'test', db: handle.db, ...options })
  let cookie: string | undefined
  let offline = false

  const fetchFn: FetchFn = async (input, init = {}) => {
    if (offline) throw new TypeError('Failed to fetch')
    const headers = new Headers(init.headers)
    if (cookie !== undefined) headers.set('cookie', cookie)
    if ((init.method ?? 'GET') !== 'GET') headers.set('origin', 'http://localhost')
    // Like a network hop: the server never sees browser-only options such as keepalive.
    const forwarded = { ...init, headers }
    delete forwarded.keepalive
    const res = await app.request(input, forwarded)
    const session = /agendina_session=([^;]*)/.exec(res.headers.get('set-cookie') ?? '')
    if (session !== null) cookie = session[1] === '' ? undefined : `agendina_session=${session[1]}`
    return res
  }

  return {
    fetch: fetchFn,
    db: handle.db,
    setOffline(value) {
      offline = value
    },
    async signup(email = 'me@example.com') {
      const res = await fetchFn('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD }),
      })
      if (res.status !== 201) throw new Error(`signup failed: ${res.status}`)
    },
    close: () => handle.close(),
  }
}
