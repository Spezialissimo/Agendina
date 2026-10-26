import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../test/render.tsx'
import { PASSWORD, startTestServer, type TestServer } from '../test/server.ts'

describe('signing in', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await startTestServer()
  })

  afterEach(async () => {
    await server.close()
  })

  describe('on a new instance', () => {
    it('asks to create the admin account, then opens today’s page', async () => {
      const { user, router } = renderApp(server, '/')

      expect(
        await screen.findByRole('heading', { name: 'Welcome to Agendina' }),
      ).toBeInTheDocument()
      await user.type(screen.getByLabelText('Email'), 'me@example.com')
      await user.type(screen.getByLabelText('Password'), PASSWORD)
      await user.type(screen.getByLabelText('Repeat password'), PASSWORD)
      await user.click(screen.getByRole('button', { name: 'Create account' }))

      expect(
        await screen.findByRole('heading', { name: 'Monday, 26 October 2026' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/day/2026-10-26')
      const admins = await server.db.selectFrom('users').select('role').execute()
      expect(admins).toEqual([{ role: 'admin' }])
    })

    it('checks the password before sending anything', async () => {
      const { user } = renderApp(server, '/')
      await screen.findByRole('heading', { name: 'Welcome to Agendina' })

      await user.type(screen.getByLabelText('Email'), 'me@example.com')
      await user.type(screen.getByLabelText('Password'), 'short')
      await user.type(screen.getByLabelText('Repeat password'), 'shorter')
      await user.click(screen.getByRole('button', { name: 'Create account' }))

      expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument()
      expect(screen.getByText('The passwords do not match.')).toBeInTheDocument()
      expect(await server.db.selectFrom('users').select('id').execute()).toEqual([])
    })
  })

  describe('with an existing account', () => {
    beforeEach(async () => {
      await server.signup('me@example.com')
      await server.fetch('/api/auth/logout', { method: 'POST' })
    })

    it('signs in and opens the requested page', async () => {
      const { user, router } = renderApp(server, '/day/2026-10-20')

      await user.type(await screen.findByLabelText('Email'), 'me@example.com')
      await user.type(screen.getByLabelText('Password'), PASSWORD)
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      expect(
        await screen.findByRole('heading', { name: 'Tuesday, 20 October 2026' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/day/2026-10-20')
    })

    it('explains a wrong password', async () => {
      const { user } = renderApp(server, '/')

      await user.type(await screen.findByLabelText('Email'), 'me@example.com')
      await user.type(screen.getByLabelText('Password'), 'not the password')
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
    })

    it('offers no signup while it is closed', async () => {
      renderApp(server, '/')

      await screen.findByRole('button', { name: 'Sign in' })
      expect(screen.queryByRole('button', { name: 'Create an account' })).not.toBeInTheDocument()
    })

    it('lets new people sign up once the admin opened signup', async () => {
      await server.fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'me@example.com', password: PASSWORD }),
      })
      await server.fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signupOpen: true }),
      })
      await server.fetch('/api/auth/logout', { method: 'POST' })
      const { user } = renderApp(server, '/')

      await user.click(await screen.findByRole('button', { name: 'Create an account' }))
      await user.type(screen.getByLabelText('Email'), 'new@example.com')
      await user.type(screen.getByLabelText('Password'), PASSWORD)
      await user.type(screen.getByLabelText('Repeat password'), PASSWORD)
      await user.click(screen.getByRole('button', { name: 'Create account' }))

      expect(
        await screen.findByRole('heading', { name: 'Monday, 26 October 2026' }),
      ).toBeInTheDocument()
      const roles = await server.db
        .selectFrom('users')
        .select(['email', 'role'])
        .orderBy('email')
        .execute()
      expect(roles).toEqual([
        { email: 'me@example.com', role: 'admin' },
        { email: 'new@example.com', role: 'member' },
      ])
    })
  })

  describe('signing out', () => {
    it('returns to the sign-in screen', async () => {
      await server.signup()
      const { user } = renderApp(server, '/day/2026-10-26')

      await user.click(await screen.findByRole('button', { name: 'Sign out' }))

      expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })
  })
})

describe('routing', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await startTestServer()
    await server.signup()
  })

  afterEach(async () => {
    await server.close()
  })

  it.each(['/', '/day/2026-02-30', '/day/yesterday', '/nowhere'])(
    'sends %s to today’s page',
    async (path) => {
      const { router } = renderApp(server, path, { now: new Date('2026-10-26T23:30:00') })

      expect(
        await screen.findByRole('heading', { name: 'Monday, 26 October 2026' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/day/2026-10-26')
    },
  )
})
