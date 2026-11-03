import { AuthState, UserResponse } from '@agendina/contract'
import { testDatabases } from '@agendina/db/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { NOW, PASSWORD, sessionCookie, useTestServer } from '../testing.ts'

const DAY = 24 * 60 * 60 * 1000

describe.each(testDatabases())('auth on $kind', ({ create }) => {
  let now: Date
  beforeEach(() => {
    now = NOW
  })
  const t = useTestServer(create, { now: () => now })

  const state = async (cookie?: string) =>
    AuthState.parse(await (await t.server.request('/api/auth/state', { cookie })).json())
  const login = (email: string, password: string) =>
    t.server.request('/api/auth/login', { method: 'POST', body: { email, password } })
  const me = (cookie: string) => t.server.request('/api/me', { cookie })
  const setSignupOpen = (cookie: string, signupOpen: boolean) =>
    t.server.request('/api/admin/settings', { method: 'PUT', cookie, body: { signupOpen } })

  describe('first run', () => {
    it('asks for setup and allows signing up', async () => {
      expect(await state()).toEqual({ setupRequired: true, signupOpen: true, user: null })
    })

    it('makes the first account the admin and signs it in', async () => {
      const res = await t.server.request('/api/auth/signup', {
        method: 'POST',
        body: { email: 'Admin@Example.com', password: PASSWORD },
      })

      expect(res.status).toBe(201)
      expect(UserResponse.parse(await res.json()).user).toMatchObject({
        email: 'admin@example.com',
        role: 'admin',
      })
      const cookie = res.headers.get('set-cookie') ?? ''
      expect(cookie).toMatch(/agendina_session=[A-Za-z0-9_-]{43}/)
      expect(cookie).toMatch(/HttpOnly/i)
      expect(cookie).toMatch(/SameSite=Lax/i)
      expect(cookie).toMatch(/Path=\//i)
      expect(cookie).not.toMatch(/Secure/i)
    })

    it('closes signup once the admin exists', async () => {
      const cookie = await t.server.signup()

      expect(await state(cookie)).toMatchObject({
        setupRequired: false,
        signupOpen: false,
        user: { role: 'admin' },
      })
      const res = await t.server.request('/api/auth/signup', {
        method: 'POST',
        body: { email: 'other@example.com', password: PASSWORD },
      })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'signup_closed' })
    })
  })

  describe('signup', () => {
    it('lets anyone sign up as a member while the admin keeps signup open', async () => {
      const admin = await t.server.signup()
      expect((await setSignupOpen(admin, true)).status).toBe(200)

      const member = await t.server.signup('member@example.com')

      expect(UserResponse.parse(await (await me(member)).json()).user.role).toBe('member')
    })

    it('rejects an email that is already taken, ignoring case', async () => {
      const admin = await t.server.signup('admin@example.com')
      await setSignupOpen(admin, true)

      const res = await t.server.request('/api/auth/signup', {
        method: 'POST',
        body: { email: 'ADMIN@example.com', password: PASSWORD },
      })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'email_taken' })
    })

    it('does not reveal that an account exists while signup is closed', async () => {
      await t.server.signup('admin@example.com')

      const res = await t.server.request('/api/auth/signup', {
        method: 'POST',
        body: { email: 'admin@example.com', password: PASSWORD },
      })

      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'signup_closed' })
    })

    it.each([
      ['an invalid email', { email: 'not-an-email', password: PASSWORD }],
      ['a short password', { email: 'a@example.com', password: 'short' }],
      ['a missing field', { email: 'a@example.com' }],
    ])('rejects %s', async (_, body) => {
      const res = await t.server.request('/api/auth/signup', { method: 'POST', body })

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'invalid_request' })
    })

    it('rejects a body that is not JSON', async () => {
      const res = await t.server.request('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'invalid_request' })
    })

    it('stores an argon2id hash, never the password', async () => {
      await t.server.signup()

      const user = await t.handle.db
        .selectFrom('users')
        .select('password_hash')
        .executeTakeFirstOrThrow()
      expect(user.password_hash).toMatch(/^\$argon2id\$/)
      expect(user.password_hash).not.toContain(PASSWORD)
    })
  })

  describe('login and logout', () => {
    it('signs in with the right password, ignoring email case and spaces', async () => {
      await t.server.signup('admin@example.com')

      const res = await login('  Admin@Example.COM ', PASSWORD)

      expect(res.status).toBe(200)
      expect((await me(sessionCookie(res))).status).toBe(200)
    })

    it('gives the same answer for a wrong password and an unknown email', async () => {
      await t.server.signup('admin@example.com')

      const wrongPassword = await login('admin@example.com', 'wrong password!!')
      const unknownEmail = await login('nobody@example.com', PASSWORD)

      expect(wrongPassword.status).toBe(401)
      expect(unknownEmail.status).toBe(401)
      expect(await wrongPassword.json()).toEqual({ error: 'invalid_credentials' })
      expect(await unknownEmail.json()).toEqual({ error: 'invalid_credentials' })
    })

    it('blocks an email for 15 minutes after 10 failed attempts', async () => {
      await t.server.signup('admin@example.com')
      for (let i = 0; i < 10; i++)
        expect((await login('admin@example.com', 'wrong password!!')).status).toBe(401)

      const blocked = await login('admin@example.com', PASSWORD)
      expect(blocked.status).toBe(429)
      expect(await blocked.json()).toEqual({ error: 'too_many_attempts' })

      now = new Date(now.getTime() + 15 * 60 * 1000)
      expect((await login('admin@example.com', PASSWORD)).status).toBe(200)
    })

    it('logs out: the session stops working and the cookie is cleared', async () => {
      const cookie = await t.server.signup()

      const res = await t.server.request('/api/auth/logout', { method: 'POST', cookie })

      expect(res.status).toBe(204)
      expect(res.headers.get('set-cookie')).toMatch(/agendina_session=;.*Max-Age=0/i)
      expect((await me(cookie)).status).toBe(401)
    })
  })

  describe('sessions', () => {
    it('stores only a hash of the session token', async () => {
      const cookie = await t.server.signup()
      const token = cookie.split('=')[1] ?? ''

      const sessions = await t.handle.db.selectFrom('sessions').select('id').execute()
      expect(sessions).toHaveLength(1)
      expect(sessions[0]?.id).not.toContain(token)
    })

    it('rejects unknown or tampered tokens', async () => {
      const cookie = await t.server.signup()

      expect((await me('agendina_session=nonsense')).status).toBe(401)
      expect((await me(`${cookie.slice(0, -2)}xx`)).status).toBe(401)
      expect(await (await me('agendina_session=nonsense')).json()).toEqual({
        error: 'unauthorized',
      })
    })

    it('expires after 30 days without use', async () => {
      const cookie = await t.server.signup()

      now = new Date(now.getTime() + 31 * DAY)

      expect((await me(cookie)).status).toBe(401)
    })

    it('renews while in use', async () => {
      const cookie = await t.server.signup()

      now = new Date(now.getTime() + 20 * DAY)
      expect((await me(cookie)).status).toBe(200)
      now = new Date(now.getTime() + 20 * DAY)

      expect((await me(cookie)).status).toBe(200)
    })
  })

  describe('instance settings', () => {
    it('can only be changed by the admin', async () => {
      const admin = await t.server.signup()
      await setSignupOpen(admin, true)
      const member = await t.server.signup('member@example.com')

      expect((await setSignupOpen(member, false)).status).toBe(403)
      expect((await t.server.request('/api/admin/settings')).status).toBe(401)
      expect(
        await (await t.server.request('/api/admin/settings', { cookie: admin })).json(),
      ).toEqual({ signupOpen: true })
    })
  })

  describe('cross-site requests', () => {
    it('rejects form posts from another origin', async () => {
      await t.server.signup()

      const res = await t.server.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://evil.example',
        },
      })

      expect(res.status).toBe(403)
    })
  })
})
