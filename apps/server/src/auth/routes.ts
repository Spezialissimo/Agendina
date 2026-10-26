import {
  Credentials,
  InstanceSettings,
  type AuthState,
  type UserResponse,
} from '@agendina/contract'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { ApiError, readJson, requireUser, type AppEnv } from '../http.ts'
import { hashPassword, verifyPassword } from './password.ts'
import { FailureLimiter } from './rate-limit.ts'
import { SESSION_LIFETIME, createSession, deleteSession, findSessionUser } from './sessions.ts'
import { SIGNUP_OPEN, createUser, isSignupOpen } from './users.ts'

const COOKIE = 'agendina_session'

export function authRoutes(now: () => Date) {
  const routes = new Hono<AppEnv>()
  const loginFailures = new FailureLimiter(10, 15 * 60 * 1000, now)
  // Verifying against a dummy hash for unknown emails makes both failures take the same time.
  let dummyHash: Promise<string> | undefined

  routes.get('/auth/state', async (c) => {
    const db = c.get('db')
    const setupRequired =
      (await db.selectFrom('users').select('id').limit(1).executeTakeFirst()) === undefined
    const body: AuthState = {
      setupRequired,
      signupOpen: setupRequired || (await isSignupOpen(db)),
      user: c.get('user') ?? null,
    }
    return c.json(body)
  })

  routes.post('/auth/signup', async (c) => {
    const { email, password } = await readJson(c, Credentials)
    const db = c.get('db')
    const passwordHash = await hashPassword(password)
    const user = await createUser(db, email, passwordHash, now())
    await startSession(c, user.id)
    return c.json({ user } satisfies UserResponse, 201)
  })

  routes.post('/auth/login', async (c) => {
    const { email, password } = await readJson(c, Credentials)
    if (loginFailures.isBlocked(email)) throw new ApiError(429, 'too_many_attempts')

    const row = await c
      .get('db')
      .selectFrom('users')
      .select(['id', 'email', 'role', 'password_hash'])
      .where('email', '=', email)
      .executeTakeFirst()
    dummyHash ??= hashPassword('not a real password')
    const valid = await verifyPassword(password, row?.password_hash ?? (await dummyHash))
    if (row === undefined || !valid) {
      loginFailures.recordFailure(email)
      throw new ApiError(401, 'invalid_credentials')
    }

    loginFailures.reset(email)
    await startSession(c, row.id)
    return c.json({ user: { id: row.id, email: row.email, role: row.role } } satisfies UserResponse)
  })

  routes.post('/auth/logout', async (c) => {
    const token = c.get('sessionToken')
    if (token !== undefined) await deleteSession(c.get('db'), token)
    deleteCookie(c, COOKIE, { path: '/' })
    return c.body(null, 204)
  })

  routes.get('/me', (c) => c.json({ user: requireUser(c) } satisfies UserResponse))

  routes.get('/admin/settings', async (c) => {
    requireAdmin(c)
    return c.json({ signupOpen: await isSignupOpen(c.get('db')) } satisfies InstanceSettings)
  })

  routes.put('/admin/settings', async (c) => {
    requireAdmin(c)
    const settings = await readJson(c, InstanceSettings)
    await c
      .get('db')
      .insertInto('instance_settings')
      .values({ key: SIGNUP_OPEN, value: JSON.stringify(settings.signupOpen) })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({ value: JSON.stringify(settings.signupOpen) }),
      )
      .execute()
    return c.json(settings)
  })

  async function startSession(c: Context<AppEnv>, userId: string) {
    const token = await createSession(c.get('db'), userId, now())
    setSessionCookie(c, token)
  }

  return routes
}

/** Reads the session cookie and sets `user` / `sessionToken` for the rest of the request. */
export async function loadSession(c: Context<AppEnv>, next: () => Promise<void>) {
  const token = getCookie(c, COOKIE)
  const session =
    token === undefined ? undefined : await findSessionUser(c.get('db'), token, c.get('now')())
  c.set('user', session?.user)
  c.set('sessionToken', session === undefined ? undefined : token)
  if (session?.renewed === true && token !== undefined) setSessionCookie(c, token)
  await next()
}

function requireAdmin(c: Context<AppEnv>): void {
  if (requireUser(c).role !== 'admin') throw new ApiError(403, 'forbidden')
}

function setSessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_LIFETIME / 1000,
    secure: isHttps(c),
  })
}

function isHttps(c: Context): boolean {
  return new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https'
}
