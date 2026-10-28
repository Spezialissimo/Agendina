import { DEFAULT_SETTINGS } from '@agendina/contract'
import { US_WEEK } from '@agendina/core'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { editorText, typeInto } from '../test/editor.ts'
import { renderApp } from '../test/render.tsx'
import { startTestServer, type TestServer } from '../test/server.ts'

describe('settings', () => {
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

  const openSettings = async (path: string) => {
    const view = renderApp(server, path)
    await view.user.click(await screen.findByRole('button', { name: 'Settings' }))
    return { ...view, dialog: screen.getByRole('dialog', { name: 'Settings' }) }
  }

  describe('week start', () => {
    it('starts weeks on the chosen day, and remembers it', async () => {
      const { user, dialog } = await openSettings('/day/2026-10-27')

      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: 'Weeks start on' }),
        'Sunday',
      )

      expect(within(weekStrip()).getAllByRole('link')[0]).toHaveAccessibleName(/^Sun 25/)
      await waitFor(async () => {
        expect((await api.settings()).weekRule.firstDay).toBe(7)
      })
    })

    it('numbers weeks from the week with 1 January, or the first with four days of the year', async () => {
      // Friday 1 January 2027: ISO puts it in week 53 of 2026, the US rule in week 1.
      const { user, dialog } = await openSettings('/day/2027-01-01')
      const numbering = within(dialog).getByRole('combobox', { name: 'Week 1 is' })
      expect(within(weekStrip()).getByText('Week 53')).toBeInTheDocument()

      await user.selectOptions(numbering, 'The week with 1 January')
      expect(within(weekStrip()).getByText('Week 1')).toBeInTheDocument()

      await user.selectOptions(numbering, 'The first week with four days of the new year (ISO)')
      expect(within(weekStrip()).getByText('Week 53')).toBeInTheDocument()
      await waitFor(async () => {
        expect((await api.settings()).weekRule.minimalDays).toBe(4)
      })
    })

    it('shows the current rule when opened', async () => {
      await api.saveSettings({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })

      const { dialog } = await openSettings('/day/2026-10-27')

      expect(within(dialog).getByRole('combobox', { name: 'Weeks start on' })).toHaveValue('7')
      expect(within(dialog).getByRole('combobox', { name: 'Week 1 is' })).toHaveValue('1')
    })

    it('closes with the Close button or Escape', async () => {
      const { user, dialog } = await openSettings('/day/2026-10-27')
      await user.click(within(dialog).getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Settings' }))
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens from the command palette', async () => {
      const { user } = renderApp(server, '/day/2026-10-27')
      await screen.findByRole('navigation', { name: 'Week' })

      await user.keyboard('{Meta>}k{/Meta}')
      await user.type(screen.getByRole('combobox', { name: 'Search commands' }), 'settings{Enter}')

      expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    })
  })

  describe('week pages written before the week start changed', () => {
    it('are still shown, and edits keep going to them', async () => {
      // Written while weeks started on Monday 26 October.
      await api.saveNote('week', '2026-10-26', 'Plans', 0)
      await api.saveSettings({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })

      renderApp(server, '/day/2026-10-27')

      const week = await screen.findByRole('textbox', { name: 'Week 44' })
      expect(editorText(week)).toBe('Plans')
      expect(screen.getByRole('region', { name: 'Week 44' })).toHaveTextContent('25 – 31 Oct 2026')

      typeInto(week, ' and more')
      await waitFor(async () => {
        expect((await api.getNote('week', '2026-10-26'))?.content).toBe('Plans and more')
      })
      expect(await api.getNote('week', '2026-10-25')).toBeNull()
    })

    it('give way to a page that starts on the week’s first day', async () => {
      await api.saveNote('week', '2026-10-26', 'Old Monday page', 0)
      await api.saveNote('week', '2026-10-25', 'Sunday page', 0)
      await api.saveSettings({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })

      renderApp(server, '/day/2026-10-27')

      expect(editorText(await screen.findByRole('textbox', { name: 'Week 44' }))).toBe(
        'Sunday page',
      )
    })

    it('do not leak into the next week', async () => {
      // Monday 19 October belongs to the Sunday 18 week, not to the Sunday 25 one.
      await api.saveNote('week', '2026-10-19', 'Last week', 0)
      await api.saveSettings({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })

      renderApp(server, '/day/2026-10-27')

      expect(editorText(await screen.findByRole('textbox', { name: 'Week 44' }))).toBe('')
    })
  })
})
