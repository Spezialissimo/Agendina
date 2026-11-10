import type { Layout } from '@agendina/core'
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { renderApp } from '../test/render.tsx'
import { settingsWithLayout } from '../test/settings.ts'
import { startTestServer, type TestServer } from '../test/server.ts'

const CALENDAR_AND_DAY: Layout = {
  type: 'split',
  id: 'pages',
  direction: 'row',
  children: [
    { size: 0.3, node: { type: 'panel', id: 'calendar', panel: { type: 'calendar' } } },
    {
      size: 0.7,
      node: { type: 'panel', id: 'day', panel: { type: 'note', kind: 'day', offset: 0 } },
    },
  ],
}

describe('calendar panel', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await startTestServer()
    await server.signup()
    await new Api(server.fetch).saveSettings(settingsWithLayout(CALENDAR_AND_DAY))
  })

  afterEach(async () => {
    await server.close()
  })

  // Today is Monday 26 October 2026 (the default clock of the tests).
  const open = async (path = '/day/2026-10-28') => {
    const view = renderApp(server, path)
    const calendar = within(await screen.findByRole('region', { name: 'Calendar' }))
    const day = (name: string) => calendar.getByRole('button', { name })
    return { ...view, calendar, day }
  }

  it('shows the month of the selected day, always open, next to the pages', async () => {
    const { calendar, day } = await open()

    expect(calendar.getByText('October 2026')).toBeInTheDocument()
    expect(day('October 28, 2026')).toHaveAttribute('aria-current', 'date')
    expect(day('October 26, 2026')).toHaveAttribute('data-today')
    expect(day('October 27, 2026')).not.toHaveAttribute('aria-current')
    expect(
      await screen.findByRole('textbox', { name: 'Wednesday, October 28, 2026' }),
    ).toBeInTheDocument()
    // It is a panel, not the pop-up of the calendar button.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('selects the day that is clicked, and stays open', async () => {
    const { user, router, day } = await open()

    await user.click(day('October 30, 2026'))

    expect(router.state.location.pathname).toBe('/day/2026-10-30')
    expect(
      await screen.findByRole('textbox', { name: 'Friday, October 30, 2026' }),
    ).toBeInTheDocument()
    expect(day('October 30, 2026')).toHaveAttribute('aria-current', 'date')
    expect(day('October 28, 2026')).not.toHaveAttribute('aria-current')
  })

  it('browses other months without leaving the day', async () => {
    const { user, router, calendar } = await open()

    await user.click(calendar.getByRole('button', { name: 'Next month' }))

    expect(calendar.getByText('November 2026')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/day/2026-10-28')

    await user.click(calendar.getByRole('button', { name: 'Previous month' }))
    await user.click(calendar.getByRole('button', { name: 'Previous month' }))

    expect(calendar.getByText('September 2026')).toBeInTheDocument()
  })

  it('selects a day of another month, and shows that month from then on', async () => {
    const { user, router, calendar, day } = await open()

    await user.click(calendar.getByRole('button', { name: 'Next month' }))
    await user.click(day('November 12, 2026'))

    expect(router.state.location.pathname).toBe('/day/2026-11-12')
    expect(calendar.getByText('November 2026')).toBeInTheDocument()
    expect(day('November 12, 2026')).toHaveAttribute('aria-current', 'date')
  })

  it('goes back to the month of the selected day when the day changes elsewhere', async () => {
    const { user, calendar, day } = await open()
    await user.click(calendar.getByRole('button', { name: 'Next month' }))
    expect(calendar.getByText('November 2026')).toBeInTheDocument()

    // The next day, from the week strip.
    await user.click(
      within(screen.getByRole('navigation', { name: 'Week' })).getByRole('link', {
        name: /^Thu 29/,
      }),
    )

    expect(await calendar.findByText('October 2026')).toBeInTheDocument()
    expect(day('October 29, 2026')).toHaveAttribute('aria-current', 'date')
  })

  it('starts weeks on the day the user chose', async () => {
    await new Api(server.fetch).saveSettings(
      settingsWithLayout(CALENDAR_AND_DAY, { weekRule: { firstDay: 7, minimalDays: 1 } }),
    )
    const { calendar } = await open()

    const firstRow = calendar.getAllByRole('row')[1]
    if (firstRow === undefined) throw new Error('No week in the calendar')
    // The week of 1 October 2026 (a Thursday) starts on Sunday 27 September.
    expect(within(firstRow).getAllByRole('button')[0]).toHaveAccessibleName('September 27, 2026')
  })
})
