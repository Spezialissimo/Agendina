import { MAX_PANELS, OPEN_PLANNER, type Layout } from '@agendina/core'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Api } from '../api/client.ts'
import { typeInto } from '../test/editor.ts'
import { renderApp } from '../test/render.tsx'
import { settingsWithLayout } from '../test/settings.ts'
import { startTestServer, type TestServer } from '../test/server.ts'

const panelNode = (id: string, kind: 'day' | 'week', offset: number): Layout => ({
  type: 'panel',
  id,
  panel: { type: 'note', kind, offset },
})

// Monday 26 October 2026 starts ISO week 44.
const MONDAY = 'Monday, October 26, 2026'
const SUNDAY_BEFORE = 'Sunday, October 25, 2026'
const TUESDAY = 'Tuesday, October 27, 2026'

describe('layout editor', () => {
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

  const page = (name: string) => screen.queryByRole('region', { name })
  const editor = () => screen.queryByRole('region', { name: 'Layout' })
  /** The controls of one page while the layout is edited, named by what the page shows. */
  const panel = (name: string) => within(screen.getByRole('group', { name: `${name} panel` }))
  const separators = () => screen.queryAllByRole('separator', { name: 'Resize pages' })
  const savedLayout = async () => (await api.settings()).layout

  /** The button that edits the layout on show: "Edit …", or "Duplicate and edit …" a preset. */
  const editActiveLayout = (settings: HTMLElement) => {
    const name = within(settings).getByRole('radio', { checked: true }).getAttribute('aria-label')
    return within(settings).getByRole('button', {
      name: new RegExp(`^(Edit|Duplicate and edit) ${String(name)}$`),
    })
  }

  const editLayout = async () => {
    const view = renderApp(server, '/day/2026-10-26')
    await view.user.click(await screen.findByRole('button', { name: 'Settings' }))
    const settings = screen.getByRole('dialog', { name: 'Settings' })
    await view.user.click(editActiveLayout(settings))
    await screen.findByRole('region', { name: 'Layout' })
    return view
  }

  const panels = () => screen.queryAllByRole('group', { name: /panel$/ })
  const panelNames = () => panels().map((p) => p.getAttribute('aria-label'))

  /** Saves and waits for the pages to be back. */
  const save = async (user: ReturnType<typeof renderApp>['user']) => {
    await user.click(screen.getByRole('button', { name: 'Save layout' }))
    expect(editor()).not.toBeInTheDocument()
    expect(panels()).toHaveLength(0)
    await screen.findByRole('navigation', { name: 'Week' })
  }

  describe('opening', () => {
    it('opens from Settings, with a placeholder for each page', async () => {
      await editLayout()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(editor()).toBeInTheDocument()
      expect(panelNames()).toEqual(['Selected week panel', 'Selected day panel'])
      // The notes themselves are away until the layout is saved or cancelled.
      // The only field is the layout's name.
      expect(screen.getAllByRole('textbox')).toEqual([
        screen.getByRole('textbox', { name: 'Name' }),
      ])
      expect(page('Week 44')).not.toBeInTheDocument()
      expect(page(MONDAY)).not.toBeInTheDocument()
    })

    it('opens from the command palette', async () => {
      const { user } = renderApp(server, '/day/2026-10-26')
      await screen.findByRole('navigation', { name: 'Week' })

      await user.keyboard('{Meta>}{k}{/Meta}')
      await user.keyboard('edit layout')
      await user.keyboard('{Enter}')

      expect(editor()).toBeInTheDocument()
    })

    it('shows no layout controls until asked', async () => {
      renderApp(server, '/day/2026-10-26')
      await screen.findByRole('textbox', { name: MONDAY })

      expect(editor()).not.toBeInTheDocument()
      expect(panels()).toHaveLength(0)
      expect(screen.queryByRole('combobox', { name: 'Arrange pages' })).not.toBeInTheDocument()
    })

    it('keeps what was typed in a page just before', async () => {
      const { user } = renderApp(server, '/day/2026-10-26')
      typeInto(await screen.findByRole('textbox', { name: MONDAY }), 'Call the plumber')

      await user.keyboard('{Meta>}{k}{/Meta}')
      await user.keyboard('edit layout')
      await user.keyboard('{Enter}')
      expect(editor()).toBeInTheDocument()

      await waitFor(async () => {
        expect((await api.getNote('day', '2026-10-26'))?.content).toBe('Call the plumber')
      })
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(await screen.findByRole('textbox', { name: MONDAY })).toHaveTextContent(
        'Call the plumber',
      )
    })
  })

  describe('while editing, nothing else can be done', () => {
    it('offers no way to another day, to Settings or out of the account', async () => {
      await editLayout()

      expect(screen.queryByRole('navigation', { name: 'Week' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    })

    it('ignores the shortcuts, also the command palette', async () => {
      const { user, router } = await editLayout()

      await user.keyboard('{Meta>}{Shift>}[Period]{/Shift}{/Meta}')
      await user.keyboard('{Meta>}{k}{/Meta}')

      expect(router.state.location.pathname).toBe('/day/2026-10-26')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(editor()).toBeInTheDocument()
    })
  })

  describe('changing the layout', () => {
    it('stacks pages that were side by side', async () => {
      const { user } = await editLayout()
      expect(separators()[0]).toHaveAttribute('aria-orientation', 'vertical')

      await user.selectOptions(screen.getByRole('combobox', { name: 'Arrange pages' }), 'Stacked')

      expect(separators()[0]).toHaveAttribute('aria-orientation', 'horizontal')
      await save(user)
      await waitFor(async () => {
        expect(await savedLayout()).toEqual({ ...OPEN_PLANNER, direction: 'column' })
      })
    })

    it('shows another page in a panel', async () => {
      const { user } = await editLayout()

      await user.selectOptions(
        panel('Selected week').getByRole('combobox', { name: 'Shows' }),
        'Day before',
      )

      expect(panelNames()).toEqual(['Day before panel', 'Selected day panel'])
      expect(panel('Day before').getByRole('combobox', { name: 'Shows' })).toHaveDisplayValue(
        'Day before',
      )
      await save(user)
      expect(await screen.findByRole('region', { name: SUNDAY_BEFORE })).toBeInTheDocument()
      expect(page('Week 44')).not.toBeInTheDocument()
      await waitFor(async () => {
        expect(await savedLayout()).toMatchObject({
          children: [
            { size: 0.45, node: { id: 'week', panel: { kind: 'day', offset: -1 } } },
            { size: 0.55, node: { id: 'day', panel: { kind: 'day', offset: 0 } } },
          ],
        })
      })
    })

    it('shows a calendar in a panel', async () => {
      const { user } = await editLayout()

      await user.selectOptions(
        panel('Selected week').getByRole('combobox', { name: 'Shows' }),
        'Calendar',
      )

      expect(panelNames()).toEqual(['Calendar panel', 'Selected day panel'])
      expect(panel('Calendar').getByRole('combobox', { name: 'Shows' })).toHaveDisplayValue(
        'Calendar',
      )
      await save(user)
      expect(await screen.findByRole('region', { name: 'Calendar' })).toBeInTheDocument()
      expect(page('Week 44')).not.toBeInTheDocument()
      await waitFor(async () => {
        expect(await savedLayout()).toMatchObject({
          children: [
            { size: 0.45, node: { id: 'week', panel: { type: 'calendar' } } },
            { size: 0.55, node: { id: 'day', panel: { kind: 'day', offset: 0 } } },
          ],
        })
      })
    })

    it('adds a page on a side of another', async () => {
      const { user } = await editLayout()

      await user.click(panel('Selected day').getByRole('button', { name: 'Add page on the right' }))

      expect(panelNames()).toEqual(['Selected week panel', 'Selected day panel', 'Day after panel'])
      expect(separators().map((s) => s.getAttribute('aria-orientation'))).toEqual([
        'vertical',
        'vertical',
      ])
      await save(user)
      expect(await screen.findByRole('region', { name: TUESDAY })).toBeInTheDocument()
      await waitFor(async () => {
        expect(await savedLayout()).toMatchObject({
          direction: 'row',
          children: [
            { node: { panel: { kind: 'week', offset: 0 } } },
            { node: { panel: { kind: 'day', offset: 0 } } },
            { node: { panel: { kind: 'day', offset: 1 } } },
          ],
        })
      })
    })

    it('adds a page below another', async () => {
      const { user } = await editLayout()

      await user.click(panel('Selected day').getByRole('button', { name: 'Add page below' }))

      expect(panelNames()).toEqual(['Selected week panel', 'Selected day panel', 'Day after panel'])
      expect(separators().map((s) => s.getAttribute('aria-orientation'))).toEqual([
        'vertical',
        'horizontal',
      ])
      // Each split can be rearranged on its own.
      expect(screen.getAllByRole('combobox', { name: 'Arrange pages' })).toHaveLength(2)
      await save(user)
      await waitFor(async () => {
        expect(await savedLayout()).toMatchObject({
          direction: 'row',
          children: [
            { node: { panel: { kind: 'week', offset: 0 } } },
            {
              node: {
                direction: 'column',
                children: [
                  { node: { panel: { kind: 'day', offset: 0 } } },
                  { node: { panel: { kind: 'day', offset: 1 } } },
                ],
              },
            },
          ],
        })
      })
    })

    it('removes a page, leaving the rest of the screen to the others', async () => {
      const { user } = await editLayout()

      await user.click(panel('Selected week').getByRole('button', { name: 'Delete page' }))

      expect(panelNames()).toEqual(['Selected day panel'])
      expect(separators()).toHaveLength(0)
      await save(user)
      expect(await screen.findByRole('textbox', { name: MONDAY })).toBeInTheDocument()
      expect(page('Week 44')).not.toBeInTheDocument()
      await waitFor(async () => {
        expect(await savedLayout()).toEqual(panelNode('day', 'day', 0))
      })
    })

    it('keeps the sizes dragged while editing', async () => {
      const { user } = await editLayout()
      const separator = separators()[0]

      separator?.focus()
      await user.keyboard('{ArrowRight}')
      await save(user)

      await waitFor(async () => {
        expect(await savedLayout()).toMatchObject({ children: [{ size: 0.5 }, { size: 0.5 }] })
      })
    })

    it('is kept after leaving and coming back', async () => {
      const { user, unmount } = await editLayout()
      await user.click(panel('Selected week').getByRole('button', { name: 'Delete page' }))
      await save(user)
      await waitFor(async () => {
        expect(await savedLayout()).toEqual(panelNode('day', 'day', 0))
      })
      unmount()

      renderApp(server, '/day/2026-10-26')

      expect(await screen.findByRole('textbox', { name: MONDAY })).toBeInTheDocument()
      expect(page('Week 44')).not.toBeInTheDocument()
    })
  })

  describe('adding and moving pages with the buttons on their sides', () => {
    it('adds a page on the left of another, or above it', async () => {
      const { user } = await editLayout()

      await user.click(panel('Selected day').getByRole('button', { name: 'Add page on the left' }))
      expect(panelNames()).toEqual(['Selected week panel', 'Day after panel', 'Selected day panel'])

      await user.click(panel('Selected week').getByRole('button', { name: 'Add page above' }))
      expect(panelNames()).toEqual([
        'Day before panel',
        'Selected week panel',
        'Day after panel',
        'Selected day panel',
      ])
      expect(separators().map((s) => s.getAttribute('aria-orientation'))).toEqual([
        'horizontal',
        'vertical',
        'vertical',
      ])
    })

    it('moves a page past its neighbour', async () => {
      const { user } = await editLayout()

      await user.click(panel('Selected week').getByRole('button', { name: 'Move page right' }))

      expect(panelNames()).toEqual(['Selected day panel', 'Selected week panel'])
      await save(user)
      await waitFor(async () => {
        expect(await savedLayout()).toMatchObject({
          direction: 'row',
          children: [
            { size: 0.55, node: { id: 'day' } },
            { size: 0.45, node: { id: 'week' } },
          ],
        })
      })
    })

    it('moves a page across a whole edge of the screen when nothing is in the way', async () => {
      const { user } = await editLayout()

      await user.click(panel('Selected day').getByRole('button', { name: 'Move page up' }))

      expect(panelNames()).toEqual(['Selected day panel', 'Selected week panel'])
      expect(separators()[0]).toHaveAttribute('aria-orientation', 'horizontal')
    })

    it('cannot move a page further than the edge it is at', async () => {
      await editLayout()

      expect(panel('Selected week').getByRole('button', { name: 'Move page left' })).toBeDisabled()
      expect(panel('Selected day').getByRole('button', { name: 'Move page right' })).toBeDisabled()
      expect(panel('Selected week').getByRole('button', { name: 'Move page right' })).toBeEnabled()
      expect(panel('Selected week').getByRole('button', { name: 'Move page up' })).toBeEnabled()
    })
  })

  describe('moving pages by dragging', () => {
    // jsdom lays nothing out: say where the two pages of the Open planner are on the screen,
    // the week on the left (0 to 400) and the day on the right (400 to 1000), both 600 high.
    const PLACES: Record<string, { left: number; width: number }> = {
      'Selected week panel': { left: 0, width: 400 },
      'Selected day panel': { left: 400, width: 600 },
    }
    beforeEach(() => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        const place = PLACES[this.getAttribute('aria-label') ?? '']
        const { left, width } = place ?? { left: 0, width: 0 }
        const height = place === undefined ? 0 : 600
        return {
          x: left,
          y: 0,
          left,
          top: 0,
          width,
          height,
          right: left + width,
          bottom: height,
          toJSON: () => ({}),
        }
      })
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    const pageOf = (name: string) => screen.getByRole('group', { name: `${name} panel` })
    const at = (clientX: number, clientY: number) => ({ clientX, clientY, button: 0 })
    /** Presses on the week page (not on a control) and carries it to a point of the screen. */
    const carryWeekTo = (x: number, y: number) => {
      fireEvent.pointerDown(panel('Selected week').getByText('The week you select.'), at(50, 50))
      fireEvent.pointerMove(window, at(60, 60))
      fireEvent.pointerMove(window, at(x, y))
    }
    const drop = (x: number, y: number) => fireEvent.pointerUp(window, at(x, y))
    /** A page in the air leaves an empty place behind: no controls in it. */
    const isEmptyPlace = (name: string) =>
      within(pageOf(name)).queryByRole('combobox', { name: 'Shows' }) === null

    it('shows the empty place the page would land in, and the others making room', async () => {
      await editLayout()

      carryWeekTo(950, 300)

      // Near the right side of the day: the week would go to its right.
      expect(panelNames()).toEqual(['Selected day panel', 'Selected week panel'])
      expect(isEmptyPlace('Selected week')).toBe(true)
      expect(isEmptyPlace('Selected day')).toBe(false)

      fireEvent.pointerMove(window, at(700, 580))

      // Near the bottom of the day: below it.
      expect(panelNames()).toEqual(['Selected day panel', 'Selected week panel'])
      expect(separators()[0]).toHaveAttribute('aria-orientation', 'horizontal')
    })

    it('moves the page where it is dropped', async () => {
      const { user } = await editLayout()

      carryWeekTo(950, 300)
      drop(950, 300)

      expect(panelNames()).toEqual(['Selected day panel', 'Selected week panel'])
      expect(isEmptyPlace('Selected week')).toBe(false)
      await save(user)
      await waitFor(async () => {
        expect(await savedLayout()).toMatchObject({
          direction: 'row',
          children: [{ node: { id: 'day' } }, { node: { id: 'week' } }],
        })
      })
    })

    it('moves the page above or below another', async () => {
      const { user } = await editLayout()

      carryWeekTo(700, 20)
      drop(700, 20)

      expect(panelNames()).toEqual(['Selected week panel', 'Selected day panel'])
      expect(separators()[0]).toHaveAttribute('aria-orientation', 'horizontal')
      await save(user)
      await waitFor(async () => {
        expect(await savedLayout()).toMatchObject({
          direction: 'column',
          children: [{ node: { id: 'week' } }, { node: { id: 'day' } }],
        })
      })
    })

    it('puts the page back when it is dropped on its own place', async () => {
      await editLayout()

      carryWeekTo(950, 300)
      fireEvent.pointerMove(window, at(200, 300))
      drop(200, 300)

      expect(panelNames()).toEqual(['Selected week panel', 'Selected day panel'])
      expect(separators()[0]).toHaveAttribute('aria-orientation', 'vertical')
      expect(isEmptyPlace('Selected week')).toBe(false)
    })

    it('puts the page back with Escape', async () => {
      const { user } = await editLayout()

      carryWeekTo(950, 300)
      await user.keyboard('{Escape}')

      expect(panelNames()).toEqual(['Selected week panel', 'Selected day panel'])
      expect(isEmptyPlace('Selected week')).toBe(false)
      // Letting go afterwards does nothing more.
      drop(950, 300)
      expect(panelNames()).toEqual(['Selected week panel', 'Selected day panel'])
    })

    it('does not pick a page up on a mere click, nor by its controls', async () => {
      await editLayout()

      fireEvent.pointerDown(panel('Selected week').getByText('The week you select.'), at(50, 50))
      fireEvent.pointerMove(window, at(52, 51))
      expect(isEmptyPlace('Selected week')).toBe(false)
      drop(52, 51)

      fireEvent.pointerDown(
        panel('Selected week').getByRole('combobox', { name: 'Shows' }),
        at(200, 300),
      )
      fireEvent.pointerMove(window, at(950, 300))

      expect(isEmptyPlace('Selected week')).toBe(false)
      expect(panelNames()).toEqual(['Selected week panel', 'Selected day panel'])
    })
  })

  describe('saving and cancelling', () => {
    it('saves nothing until asked, and nothing when cancelled', async () => {
      const { user } = await editLayout()
      await user.click(panel('Selected week').getByRole('button', { name: 'Delete page' }))
      // Longer than the delay settings are saved after.
      await new Promise((resolve) => setTimeout(resolve, 600))
      expect(await savedLayout()).toEqual(OPEN_PLANNER)

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(editor()).not.toBeInTheDocument()
      expect(await screen.findByRole('region', { name: 'Week 44' })).toBeInTheDocument()
      await new Promise((resolve) => setTimeout(resolve, 600))
      expect(await savedLayout()).toEqual(OPEN_PLANNER)
    })
  })

  describe('layouts that would not work', () => {
    it('cannot remove the only selected page', async () => {
      const { user } = await editLayout()
      await user.click(panel('Selected week').getByRole('button', { name: 'Delete page' }))

      expect(panel('Selected day').getByRole('button', { name: 'Delete page' })).toBeDisabled()
    })

    it('cannot remove the selected page when the others are neighbours', async () => {
      const { user } = await editLayout()
      await user.selectOptions(
        panel('Selected week').getByRole('combobox', { name: 'Shows' }),
        'Day before',
      )

      expect(panel('Selected day').getByRole('button', { name: 'Delete page' })).toBeDisabled()
      expect(panel('Day before').getByRole('button', { name: 'Delete page' })).toBeEnabled()
    })

    it('cannot show a second calendar, nor only a calendar', async () => {
      const { user } = await editLayout()
      const weekShows = () => panel('Selected week').getByRole('combobox', { name: 'Shows' })
      expect(within(weekShows()).getByRole('option', { name: 'Calendar' })).toBeEnabled()

      await user.selectOptions(weekShows(), 'Calendar')

      const dayShows = panel('Selected day').getByRole('combobox', { name: 'Shows' })
      // One calendar is on the screen already, and the day is the only page to write in.
      expect(within(dayShows).getByRole('option', { name: 'Calendar' })).toBeDisabled()
      expect(panel('Selected day').getByRole('button', { name: 'Delete page' })).toBeDisabled()
    })

    it('cannot show the same page twice', async () => {
      await editLayout()
      const shows = panel('Selected week').getByRole('combobox', { name: 'Shows' })

      expect(within(shows).getByRole('option', { name: 'Selected day' })).toBeDisabled()
      expect(within(shows).getByRole('option', { name: 'Day before' })).toBeEnabled()
      expect(within(shows).getByRole('option', { name: 'Selected week' })).toBeEnabled()
    })

    it('cannot turn the only page to write in into a read-only one', async () => {
      const { user } = await editLayout()
      await user.click(panel('Selected week').getByRole('button', { name: 'Delete page' }))
      const shows = panel('Selected day').getByRole('combobox', { name: 'Shows' })

      expect(within(shows).getByRole('option', { name: 'Day after' })).toBeDisabled()
      expect(within(shows).getByRole('option', { name: 'Week before' })).toBeDisabled()
      expect(within(shows).getByRole('option', { name: 'Selected week' })).toBeEnabled()
    })

    it(`stops adding pages at ${String(MAX_PANELS)}`, async () => {
      const { user } = await editLayout()
      const add = () => panel('Selected day').getByRole('button', { name: 'Add page on the right' })

      for (let pages = 2; pages < MAX_PANELS; pages++) await user.click(add())

      expect(add()).toBeDisabled()
      for (const name of ['Add page on the left', 'Add page above', 'Add page below']) {
        expect(panel('Selected day').getByRole('button', { name })).toBeDisabled()
      }
      expect(panels()).toHaveLength(MAX_PANELS)
    })

    it('still shows a page set from elsewhere that the list does not offer', async () => {
      const layout: Layout = {
        type: 'split',
        id: 'pages',
        direction: 'row',
        children: [
          { size: 0.5, node: panelNode('today', 'day', 0) },
          { size: 0.5, node: panelNode('later', 'day', 5) },
        ],
      }
      await api.saveSettings(settingsWithLayout(layout))

      await editLayout()

      expect(panel('5 days after').getByRole('combobox', { name: 'Shows' })).toHaveDisplayValue(
        '5 days after',
      )
    })
  })
})
