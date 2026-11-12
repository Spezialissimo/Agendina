import { DEFAULT_SETTINGS, withLayouts } from '@agendina/contract'
import {
  DEFAULT_LAYOUTS,
  MAX_CUSTOM_LAYOUTS,
  OPEN_PLANNER,
  activeLayout,
  allLayouts,
} from '@agendina/core'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { renderApp } from '../test/render.tsx'
import { startTestServer, type TestServer } from '../test/server.ts'

// Monday 26 October 2026 starts ISO week 44.
const MONDAY = 'Monday, October 26, 2026'

describe('named layouts', () => {
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

  type User = ReturnType<typeof renderApp>['user']

  const dialog = () => within(screen.getByRole('dialog', { name: 'Settings' }))
  const list = () => within(dialog().getByRole('radiogroup', { name: 'Layouts' }))
  const listed = () =>
    list()
      .getAllByRole('radio')
      .map((radio) => radio.getAttribute('aria-label'))
  const chosen = () => list().getByRole('radio', { checked: true }).getAttribute('aria-label')
  const panel = (name: string) => within(screen.getByRole('group', { name: `${name} panel` }))
  const panelNames = () =>
    screen.queryAllByRole('group', { name: /panel$/ }).map((p) => p.getAttribute('aria-label'))
  const weekPage = () => screen.queryByRole('region', { name: 'Week 44' })
  /** The splitter between the week and the day (in Open planner, the other is below the strip). */
  const separator = () => {
    const found = screen
      .getAllByRole('separator', { name: 'Resize pages' })
      .find((s) => s.getAttribute('aria-orientation') === 'vertical')
    if (found === undefined) throw new Error('No splitter between the pages')
    return found
  }

  const savedLayouts = async () => (await api.settings()).layouts
  const savedNames = async () => allLayouts(await savedLayouts()).map((l) => l.name)
  const savedActive = async () => activeLayout(await savedLayouts(), 'desktop').name

  const start = async () => {
    const view = renderApp(server, '/day/2026-10-26')
    await screen.findByRole('textbox', { name: MONDAY })
    return view
  }
  const openSettings = async (user: User) => {
    await user.click(screen.getByRole('button', { name: 'Settings' }))
  }
  const closeSettings = async (user: User) => {
    await user.click(dialog().getByRole('button', { name: 'Close' }))
  }
  /** From the pages: opens the layout editor with a button in Settings, e.g. "Edit Mornings". */
  const openEditor = async (user: User, button: string) => {
    await openSettings(user)
    await user.click(dialog().getByRole('button', { name: button }))
    await screen.findByRole('region', { name: 'Layout' })
  }
  const saveEditor = async (user: User) => {
    await user.click(screen.getByRole('button', { name: 'Save layout' }))
    // The pages are back (a saved layout may have no week strip to wait for).
    await screen.findAllByRole('textbox')
  }
  /** Turns Open planner into a layout with the day page only, as a new custom layout. */
  const dayOnlyLayout = async (user: User) => {
    await openEditor(user, 'Duplicate and edit Open planner')
    await user.click(panel('Selected week').getByRole('button', { name: 'Delete page' }))
    await user.click(panel('Week strip').getByRole('button', { name: 'Delete page' }))
    await saveEditor(user)
  }

  it('offers Open planner, chosen, as the only layout at first', async () => {
    const { user } = await start()
    await openSettings(user)

    expect(listed()).toEqual(['Open planner'])
    expect(chosen()).toBe('Open planner')
    // A preset is only duplicated, to be edited.
    expect(dialog().getByRole('button', { name: 'Duplicate and edit Open planner' })).toBeVisible()
    expect(dialog().queryByRole('button', { name: 'Edit Open planner' })).not.toBeInTheDocument()
    expect(dialog().queryByRole('button', { name: 'Delete Open planner' })).not.toBeInTheDocument()
  })

  describe('editing a preset', () => {
    it('names the copy "Custom layout 1" unless named otherwise', async () => {
      const { user } = await start()
      await openEditor(user, 'Duplicate and edit Open planner')

      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Custom layout 1')
    })

    it('saves the result as "Custom layout 1", leaving Open planner as it was', async () => {
      const { user } = await start()
      await dayOnlyLayout(user)

      expect(weekPage()).not.toBeInTheDocument()
      await openSettings(user)
      expect(listed()).toEqual(['Open planner', 'Custom layout 1'])
      expect(chosen()).toBe('Custom layout 1')

      await user.click(list().getByRole('radio', { name: 'Open planner' }))
      await closeSettings(user)
      expect(weekPage()).toBeInTheDocument()
      await waitFor(async () => {
        expect(await savedActive()).toBe('Open planner')
      })
    })

    it('duplicates it even when nothing was changed', async () => {
      const { user } = await start()
      await openEditor(user, 'Duplicate and edit Open planner')
      await saveEditor(user)

      await openSettings(user)
      expect(listed()).toEqual(['Open planner', 'Custom layout 1'])
      expect(chosen()).toBe('Custom layout 1')
    })
  })

  describe('custom layouts', () => {
    it('are created from the layout on show, numbered, and kept', async () => {
      const { user } = await start()
      await openEditor(user, 'New layout')
      // It starts as the layout on show.
      expect(panel('Selected week')).toBeDefined()
      await saveEditor(user)
      await openEditor(user, 'New layout')
      await saveEditor(user)

      await openSettings(user)
      expect(listed()).toEqual(['Open planner', 'Custom layout 1', 'Custom layout 2'])
      expect(chosen()).toBe('Custom layout 2')
      await waitFor(async () => {
        expect(await savedNames()).toEqual(['Open planner', 'Custom layout 1', 'Custom layout 2'])
      })
      expect(await savedActive()).toBe('Custom layout 2')
    })

    it('are not created when the editor is cancelled', async () => {
      const { user } = await start()
      await openEditor(user, 'New layout')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await openSettings(user)
      expect(listed()).toEqual(['Open planner'])
    })

    it('are edited in place', async () => {
      const { user } = await start()
      await dayOnlyLayout(user)
      await openEditor(user, 'Edit Custom layout 1')
      await user.click(panel('Selected day').getByRole('button', { name: 'Add page below' }))
      await saveEditor(user)

      // The page added is the first one the layout did not show: the week.
      expect(await screen.findByRole('region', { name: 'Week 44' })).toBeInTheDocument()
      await openSettings(user)
      expect(listed()).toEqual(['Open planner', 'Custom layout 1'])
    })

    it('are edited from their card when not on show, and then shown', async () => {
      const { user } = await start()
      await dayOnlyLayout(user)
      await openSettings(user)
      await user.click(list().getByRole('radio', { name: 'Open planner' }))
      await user.click(dialog().getByRole('button', { name: 'Edit Custom layout 1' }))

      expect(panelNames()).toEqual(['Selected day panel'])
      await user.click(panel('Selected day').getByRole('button', { name: 'Add page below' }))
      await saveEditor(user)

      expect(await screen.findByRole('region', { name: 'Week 44' })).toBeInTheDocument()
      await waitFor(async () => {
        expect(await savedActive()).toBe('Custom layout 1')
      })
      expect(await savedNames()).toEqual(['Open planner', 'Custom layout 1'])
    })

    it('are renamed in the layout editor', async () => {
      const { user } = await start()
      await dayOnlyLayout(user)
      await openEditor(user, 'Edit Custom layout 1')

      const name = screen.getByRole('textbox', { name: 'Name' })
      expect(name).toHaveValue('Custom layout 1')
      await user.clear(name)
      await user.type(name, 'Mornings')
      await saveEditor(user)

      await openSettings(user)
      expect(listed()).toEqual(['Open planner', 'Mornings'])
      await waitFor(async () => {
        expect(await savedNames()).toEqual(['Open planner', 'Mornings'])
      })
    })

    it('are named when created', async () => {
      const { user } = await start()
      await openEditor(user, 'New layout')
      await user.clear(screen.getByRole('textbox', { name: 'Name' }))
      await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Evenings')
      await saveEditor(user)

      await openSettings(user)
      expect(listed()).toEqual(['Open planner', 'Evenings'])
    })

    it('keep their name when the editor is cancelled or the name left blank', async () => {
      const { user } = await start()
      await dayOnlyLayout(user)

      await openEditor(user, 'Edit Custom layout 1')
      await user.type(screen.getByRole('textbox', { name: 'Name' }), ' and more')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      await openEditor(user, 'Edit Custom layout 1')
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Custom layout 1')
      await user.clear(screen.getByRole('textbox', { name: 'Name' }))
      await saveEditor(user)

      await openSettings(user)
      expect(listed()).toEqual(['Open planner', 'Custom layout 1'])
    })

    it('are deleted only once confirmed', async () => {
      const { user } = await start()
      await dayOnlyLayout(user)
      await openSettings(user)

      await user.click(dialog().getByRole('button', { name: 'Delete Custom layout 1' }))
      expect(dialog().getByText('Delete Custom layout 1?')).toBeInTheDocument()
      await user.click(dialog().getByRole('button', { name: 'Keep' }))

      expect(listed()).toEqual(['Open planner', 'Custom layout 1'])
      expect(chosen()).toBe('Custom layout 1')
      // Longer than the delay settings are saved after.
      await new Promise((resolve) => setTimeout(resolve, 600))
      expect(await savedNames()).toEqual(['Open planner', 'Custom layout 1'])
    })

    it('are deleted; deleting the one on show goes back to Open planner', async () => {
      const { user } = await start()
      await dayOnlyLayout(user)
      await openSettings(user)

      await user.click(dialog().getByRole('button', { name: 'Delete Custom layout 1' }))
      await user.click(dialog().getByRole('button', { name: 'Delete' }))

      expect(listed()).toEqual(['Open planner'])
      expect(chosen()).toBe('Open planner')
      await closeSettings(user)
      expect(weekPage()).toBeInTheDocument()
      await waitFor(async () => {
        expect(await savedNames()).toEqual(['Open planner'])
      })
    })
  })

  describe('switching layouts', () => {
    it('keeps the splitter sizes of each layout', async () => {
      const { user } = await start()
      separator().focus()
      await user.keyboard('{ArrowRight}{ArrowRight}')
      expect(separator()).toHaveAttribute('aria-valuenow', '55')
      await openEditor(user, 'New layout')
      await saveEditor(user)
      separator().focus()
      await user.keyboard('{ArrowRight}{ArrowRight}')
      expect(separator()).toHaveAttribute('aria-valuenow', '65')

      await openSettings(user)
      await user.click(list().getByRole('radio', { name: 'Open planner' }))
      await closeSettings(user)
      expect(separator()).toHaveAttribute('aria-valuenow', '55')

      await openSettings(user)
      await user.click(list().getByRole('radio', { name: 'Custom layout 1' }))
      await closeSettings(user)
      expect(separator()).toHaveAttribute('aria-valuenow', '65')
    })

    it('shows the chosen layout after a reload', async () => {
      const first = await start()
      await dayOnlyLayout(first.user)
      await openSettings(first.user)
      await first.user.click(list().getByRole('radio', { name: 'Open planner' }))
      await first.user.click(list().getByRole('radio', { name: 'Custom layout 1' }))
      await waitFor(async () => {
        expect(await savedActive()).toBe('Custom layout 1')
      })
      first.unmount()

      await start()
      expect(weekPage()).not.toBeInTheDocument()
    })
  })

  describe(`with ${String(MAX_CUSTOM_LAYOUTS)} custom layouts`, () => {
    beforeEach(async () => {
      const custom = Array.from({ length: MAX_CUSTOM_LAYOUTS }, (_, i) => ({
        id: `custom-${String(i + 1)}`,
        name: `Custom layout ${String(i + 1)}`,
        layout: OPEN_PLANNER,
      }))
      await api.saveSettings(
        withLayouts({
          ...DEFAULT_SETTINGS,
          layouts: { ...DEFAULT_LAYOUTS, custom, active: { ...DEFAULT_LAYOUTS.active } },
        }),
      )
    })

    it('offers no new layout until one is deleted', async () => {
      const { user } = await start()
      await openSettings(user)

      expect(dialog().getByRole('button', { name: 'New layout' })).toBeDisabled()
      expect(
        dialog().getByRole('button', { name: 'Duplicate and edit Open planner' }),
      ).toBeDisabled()
      expect(dialog().getByText(/Delete a layout to make another/)).toBeInTheDocument()
      expect(dialog().getByRole('button', { name: 'Edit Custom layout 1' })).toBeEnabled()

      await user.click(dialog().getByRole('button', { name: 'Delete Custom layout 100' }))
      await user.click(dialog().getByRole('button', { name: 'Delete' }))

      expect(dialog().getByRole('button', { name: 'New layout' })).toBeEnabled()
      expect(
        dialog().getByRole('button', { name: 'Duplicate and edit Open planner' }),
      ).toBeEnabled()
    })

    it('does not offer to edit Open planner from the command palette', async () => {
      const { user } = await start()

      await user.keyboard('{Meta>}k{/Meta}')
      await user.type(screen.getByRole('combobox', { name: 'Search commands' }), 'edit')

      expect(screen.getByRole('option', { name: /Edit day template/ })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /Edit layout/ })).not.toBeInTheDocument()
    })
  })
})
