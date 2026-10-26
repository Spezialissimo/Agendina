import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { Api } from '../api/client.ts'
import { AppProviders } from '../app/AppProviders.tsx'
import { routes } from '../app/routes.tsx'
import type { TestServer } from './server.ts'

/** Renders the whole app at `path`, talking to the in-process test server. */
export function renderApp(
  server: TestServer,
  path: string,
  { now = new Date('2026-10-26T10:00:00'), locale = 'en-GB' }: { now?: Date; locale?: string } = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const user = userEvent.setup()
  const view = render(
    <AppProviders api={new Api(server.fetch)} now={() => now} locale={locale}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...view, user, router }
}
