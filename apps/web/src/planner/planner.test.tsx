import { DEFAULT_SETTINGS } from '@agendina/contract'
import { US_WEEK, type Layout } from '@agendina/core'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { renderApp } from '../test/render.tsx'
import { startTestServer, type TestServer } from '../test/server.ts'

describe('planner', () => {
  let server: TestServer
  let api: Api

  beforeEach(async () => {
    server = await startTestServer()
    await server.signup()
    api = new Api(server.fetch)
  })

  afterEach(async () => {
    await server.close()
  })

  const weekStrip = () => screen.getByRole('navigation', { name: 'Week' })
  const page = (name: string) => screen.getByRole('region', { name })

  describe('pages', () => {
    it('shows the week page and the focused day page with what was written', async () => {
      // Monday 26 October 2026 starts ISO week 44 (26 Oct – 1 Nov).
      await api.saveNote('week', '2026-10-26', '| Squat | [x] |', 0)
      await api.saveNote('day', '2026-10-26', '- [ ] Finish report', 0)

      renderApp(server, '/day/2026-10-26')

      expect(await screen.findByText('| Squat | [x] |')).toBeInTheDocument()
      expect(within(page('Week 44')).getByText('| Squat | [x] |')).toBeInTheDocument()
      expect(
        within(page('Monday, 26 October 2026')).getByText('- [ ] Finish report'),
      ).toBeInTheDocument()
    })

    it('shows empty pages for days nobody wrote yet', async () => {
      renderApp(server, '/day/2026-10-27')

      expect(
        await screen.findByRole('region', { name: 'Tuesday, 27 October 2026' }),
      ).toBeInTheDocument()
      expect(page('Week 44')).toBeInTheDocument()
    })

    it('opens the week page following the user’s week rule', async () => {
      await api.saveSettings({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })
      await api.saveNote('week', '2026-10-25', 'US week', 0)

      renderApp(server, '/day/2026-10-26')

      expect(await screen.findByText('US week')).toBeInTheDocument()
      const days = within(await screen.findByRole('navigation', { name: 'Week' })).getAllByRole(
        'link',
      )
      expect(days[0]).toHaveAccessibleName(/^Sun 25/)
    })

    it('shows neighbour pages read-only, and clicking one opens that day', async () => {
      const layout: Layout = {
        type: 'split',
        id: 'pages',
        direction: 'row',
        children: [
          {
            size: 1,
            node: {
              type: 'panel',
              id: 'yesterday',
              panel: { type: 'note', kind: 'day', offset: -1 },
            },
          },
          {
            size: 2,
            node: { type: 'panel', id: 'today', panel: { type: 'note', kind: 'day', offset: 0 } },
          },
        ],
      }
      await api.saveSettings({ ...DEFAULT_SETTINGS, layout })
      const { user, router } = renderApp(server, '/day/2026-10-26')

      const yesterday = await screen.findByRole('region', { name: 'Sunday, 25 October 2026' })
      await user.click(
        within(yesterday).getByRole('button', { name: 'Open Sunday, 25 October 2026' }),
      )

      expect(router.state.location.pathname).toBe('/day/2026-10-25')
      expect(
        await screen.findByRole('region', { name: 'Saturday, 24 October 2026' }),
      ).toBeInTheDocument()
    })
  })

  describe('week strip', () => {
    it('lists the days of the focused week, marking the focused day, today and written days', async () => {
      await api.saveNote('day', '2026-10-21', 'written', 0)
      renderApp(server, '/day/2026-10-23', { now: new Date('2026-10-26T09:00:00') })

      const strip = await screen.findByRole('navigation', { name: 'Week' })

      expect(within(strip).getByText('Week 43')).toBeInTheDocument()
      const days = within(strip).getAllByRole('link')
      expect(days.map((d) => d.textContent)).toEqual([
        'Mon19',
        'Tue20',
        'Wed21',
        'Thu22',
        'Fri23',
        'Sat24',
        'Sun25',
      ])
      expect(within(strip).getByRole('link', { name: /^Fri 23/ })).toHaveAttribute(
        'aria-current',
        'date',
      )
      expect(
        await within(strip).findByRole('link', { name: 'Wed 21, written' }),
      ).toBeInTheDocument()
    })

    it('opens a day of the week', async () => {
      const { user, router } = renderApp(server, '/day/2026-10-26')

      await user.click(
        within(await screen.findByRole('navigation', { name: 'Week' })).getByRole('link', {
          name: /^Thu 29/,
        }),
      )

      expect(router.state.location.pathname).toBe('/day/2026-10-29')
      expect(
        await screen.findByRole('region', { name: 'Thursday, 29 October 2026' }),
      ).toBeInTheDocument()
    })

    it('moves a week back and forward, and back to today', async () => {
      const { user, router } = renderApp(server, '/day/2026-10-28', {
        now: new Date('2026-10-26T09:00:00'),
      })
      await screen.findByRole('navigation', { name: 'Week' })

      await user.click(within(weekStrip()).getByRole('button', { name: 'Previous week' }))
      expect(router.state.location.pathname).toBe('/day/2026-10-21')
      await user.click(within(weekStrip()).getByRole('button', { name: 'Next week' }))
      await user.click(within(weekStrip()).getByRole('button', { name: 'Next week' }))
      expect(router.state.location.pathname).toBe('/day/2026-11-04')
      expect(await within(weekStrip()).findByText('Week 45')).toBeInTheDocument()

      await user.click(within(weekStrip()).getByRole('button', { name: 'Today' }))
      expect(router.state.location.pathname).toBe('/day/2026-10-26')
    })

    it('picks any day from the month calendar', async () => {
      const { user, router } = renderApp(server, '/day/2026-10-26')

      await user.click(await screen.findByRole('button', { name: 'Choose a day' }))
      const calendar = screen.getByRole('dialog', { name: 'October 2026' })
      await user.click(within(calendar).getByRole('button', { name: 'Next month' }))
      const november = screen.getByRole('dialog', { name: 'November 2026' })
      await user.click(within(november).getByRole('button', { name: '3 November 2026' }))

      expect(router.state.location.pathname).toBe('/day/2026-11-03')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('resizing', () => {
    it('resizes the pages from the keyboard and remembers the sizes', async () => {
      const { user } = renderApp(server, '/day/2026-10-26')
      const separator = await screen.findByRole('separator', { name: 'Resize pages' })
      expect(separator).toHaveAttribute('aria-valuenow', '45')

      separator.focus()
      await user.keyboard('{ArrowRight}{ArrowRight}')

      expect(separator).toHaveAttribute('aria-valuenow', '55')
      await waitFor(async () => {
        const saved = await api.settings()
        expect(saved.layout).toMatchObject({ children: [{ size: 0.55 }, { size: 0.45 }] })
      })
    })

    it('resizes the pages by dragging', async () => {
      renderApp(server, '/day/2026-10-26')
      const separator = await screen.findByRole('separator', { name: 'Resize pages' })
      const container = separator.parentElement as HTMLElement
      container.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 1000, height: 600 }) as DOMRect

      fireEvent.pointerDown(separator, { clientX: 450, pointerId: 1 })
      fireEvent.pointerMove(separator, { clientX: 300, pointerId: 1 })
      fireEvent.pointerUp(separator, { clientX: 300, pointerId: 1 })

      expect(separator).toHaveAttribute('aria-valuenow', '30')
      await waitFor(async () => {
        expect((await api.settings()).layout).toMatchObject({
          children: [{ size: 0.3 }, { size: 0.7 }],
        })
      })
    })
  })
})
