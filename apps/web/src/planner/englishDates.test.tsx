import { render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Api } from '../api/client.ts'
import { AppProviders } from '../app/AppProviders.tsx'
import { routes } from '../app/routes.tsx'
import { startTestServer, type TestServer } from '../test/server.ts'

describe('dates in the UI', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await startTestServer()
    await server.signup()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await server.close()
  })

  it('are English whatever the browser language, with the weekday as day title', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('it-IT')
    const router = createMemoryRouter(routes, { initialEntries: ['/day/2026-11-06'] })
    // No `locale`: the app's own default is what is under test.
    render(
      <AppProviders
        api={new Api(server.fetch)}
        now={() => new Date('2026-11-06T10:00:00')}
        platform="mac"
        currentPath={() => router.state.location.pathname}
      >
        <RouterProvider router={router} />
      </AppProviders>,
    )

    const page = await screen.findByRole('region', { name: 'Friday, November 6, 2026' })
    expect(within(page).getByRole('heading', { name: 'Friday' })).toBeInTheDocument()
    expect(within(page).getByText('Nov 6, 2026')).toBeInTheDocument()
    const strip = screen.getByRole('navigation', { name: 'Week' })
    expect(within(strip).getByRole('link', { name: /^Fri 6/ })).toBeInTheDocument()
    expect(within(strip).getByText('Nov 2 – 8, 2026')).toBeInTheDocument()
  })
})
