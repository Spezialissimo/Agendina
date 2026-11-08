import { DEFAULT_SETTINGS } from '@agendina/contract'
import { bindingStatus, findConflicts, resolveKeymap } from '@agendina/core'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { renderApp } from '../test/render.tsx'
import { startTestServer, type TestServer } from '../test/server.ts'
import { COMMANDS } from './registry.ts'

describe('default shortcuts', () => {
  it.each(['mac', 'other'] as const)('are all usable and never clash on %s', (platform) => {
    for (const command of COMMANDS) {
      for (const binding of command.defaultBindings)
        expect([command.id, bindingStatus(binding, platform)]).toEqual([command.id, 'ok'])
    }
    expect(findConflicts(resolveKeymap(COMMANDS, {}))).toEqual([])
  })
})

describe('commands', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await startTestServer()
    await server.signup()
  })

  afterEach(async () => {
    await server.close()
  })

  const open = async (path: string, platform: 'mac' | 'other' = 'mac') => {
    const view = renderApp(server, path, { platform, now: new Date('2026-10-26T09:00:00') })
    await screen.findByRole('navigation', { name: 'Week' })
    return view
  }

  // Keys are given by physical code ([Period]), as the app matches KeyboardEvent.code; user-event's
  // default key map has no code for "." and ",".
  describe('keyboard shortcuts', () => {
    it.each([
      ['⇧⌘. → next day', '{Meta>}{Shift>}[Period]{/Shift}{/Meta}', '/day/2026-10-29'],
      ['⇧⌘, → previous day', '{Meta>}{Shift>}[Comma]{/Shift}{/Meta}', '/day/2026-10-27'],
      ['⌥⇧⌘. → next week', '{Meta>}{Alt>}{Shift>}[Period]{/Shift}{/Alt}{/Meta}', '/day/2026-11-04'],
      [
        '⌥⇧⌘, → previous week',
        '{Meta>}{Alt>}{Shift>}[Comma]{/Shift}{/Alt}{/Meta}',
        '/day/2026-10-21',
      ],
      ['⌥⌘T → today', '{Meta>}{Alt>}{t}{/Alt}{/Meta}', '/day/2026-10-26'],
    ])('%s on a Mac', async (_, keys, path) => {
      const { user, router } = await open('/day/2026-10-28')

      await user.keyboard(keys)

      expect(router.state.location.pathname).toBe(path)
    })

    it('uses Ctrl instead of Cmd on other platforms', async () => {
      const { user, router } = await open('/day/2026-10-28', 'other')

      await user.keyboard('{Meta>}{Shift>}[Period]{/Shift}{/Meta}')
      expect(router.state.location.pathname).toBe('/day/2026-10-28')
      await user.keyboard('{Control>}{Shift>}[Period]{/Shift}{/Control}')
      expect(router.state.location.pathname).toBe('/day/2026-10-29')
    })

    it('follows the user’s own bindings', async () => {
      await new Api(server.fetch).saveSettings({
        ...DEFAULT_SETTINGS,
        keymap: { 'focus.nextDay': ['Mod+KeyJ'] },
      })
      const { user, router } = await open('/day/2026-10-28')

      await user.keyboard('{Meta>}{Shift>}[Period]{/Shift}{/Meta}')
      expect(router.state.location.pathname).toBe('/day/2026-10-28')
      await user.keyboard('{Meta>}{j}{/Meta}')
      expect(router.state.location.pathname).toBe('/day/2026-10-29')
    })

    it('ignores plain typing', async () => {
      const { user, router } = await open('/day/2026-10-28')

      await user.keyboard('.,t')

      expect(router.state.location.pathname).toBe('/day/2026-10-28')
    })
  })

  describe('command palette', () => {
    it('opens with ⌘K, filters commands, shows their shortcuts and runs the chosen one', async () => {
      const { user, router } = await open('/day/2026-10-28')

      await user.keyboard('{Meta>}{k}{/Meta}')
      const palette = screen.getByRole('dialog', { name: 'Commands' })
      expect(within(palette).getByRole('combobox')).toHaveFocus()

      await user.keyboard('week')
      const options = within(palette).getAllByRole('option')
      expect(options.map((o) => o.textContent)).toEqual([
        'Previous week⌥⇧⌘,',
        'Next week⌥⇧⌘.',
        'Edit week template',
      ])

      await user.keyboard('{ArrowDown}{Enter}')

      expect(router.state.location.pathname).toBe('/day/2026-11-04')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('runs a command by clicking it', async () => {
      const { user, router } = await open('/day/2026-10-28')

      await user.keyboard('{Meta>}{k}{/Meta}')
      await user.click(
        within(screen.getByRole('dialog', { name: 'Commands' })).getByRole('option', {
          name: /Today/,
        }),
      )

      expect(router.state.location.pathname).toBe('/day/2026-10-26')
    })

    it('includes commands without a shortcut', async () => {
      const { user } = await open('/day/2026-10-28')

      await user.keyboard('{Meta>}{k}{/Meta}')
      await user.keyboard('sign')
      await user.keyboard('{Enter}')

      expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })

    it('closes with Escape without running anything', async () => {
      const { user, router } = await open('/day/2026-10-28')

      await user.keyboard('{Meta>}{k}{/Meta}')
      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      expect(router.state.location.pathname).toBe('/day/2026-10-28')
    })

    it('does not run page shortcuts while typing a search', async () => {
      const { user, router } = await open('/day/2026-10-28')

      await user.keyboard('{Meta>}{k}{/Meta}')
      await user.keyboard('{Meta>}{Shift>}[Period]{/Shift}{/Meta}')

      expect(router.state.location.pathname).toBe('/day/2026-10-28')
      expect(screen.getByRole('dialog', { name: 'Commands' })).toBeInTheDocument()
    })

    it('shows Windows/Linux shortcut labels off Mac', async () => {
      const { user } = await open('/day/2026-10-28', 'other')

      await user.keyboard('{Control>}{k}{/Control}')
      await user.keyboard('next day')

      expect(
        within(screen.getByRole('dialog', { name: 'Commands' })).getByRole('option'),
      ).toHaveTextContent('Next dayCtrl+Shift+.')
    })
  })
})
