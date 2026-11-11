import type { Layout } from '@agendina/core'
import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { renderApp } from '../test/render.tsx'
import { settingsWithLayout } from '../test/settings.ts'
import { startTestServer, type TestServer } from '../test/server.ts'

const note = (id: string, kind: 'day' | 'week', offset: number): Layout => ({
  type: 'panel',
  id,
  panel: { type: 'note', kind, offset },
})
const strip: Layout = { type: 'panel', id: 'strip', panel: { type: 'weekStrip' } }
const split = (
  id: string,
  direction: 'row' | 'column',
  ...children: [Layout, number][]
): Layout => ({
  type: 'split',
  id,
  direction,
  children: children.map(([node, size]) => ({ node, size })),
})

// Monday 26 October 2026 starts ISO week 44.
const MONDAY = 'Monday, October 26, 2026'

describe('week strip panel', () => {
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

  const weekStrip = () => screen.queryByRole('navigation', { name: 'Week' })
  const separators = () => screen.queryAllByRole('separator', { name: 'Resize pages' })

  it('is a panel above the pages in Open planner, resized like them; the top bar keeps Settings and Sign out', async () => {
    renderApp(server, '/day/2026-10-26')

    await screen.findByRole('textbox', { name: MONDAY })
    const nav = weekStrip()
    expect(screen.getByRole('main')).toContainElement(nav)
    expect(nav).toHaveAttribute('data-orientation', 'horizontal')
    const topBar = screen.getByRole('button', { name: 'Settings' }).closest('header')
    if (topBar === null) throw new Error('No top bar')
    expect(topBar).not.toContainElement(nav)
    expect(within(topBar).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    // Below the strip, one to make it taller; between the week and the day, the other.
    expect(separators().map((s) => s.getAttribute('aria-orientation'))).toEqual([
      'horizontal',
      'vertical',
    ])
  })

  it('keeps its size when the browser cancels a drag, though its content made it taller', async () => {
    renderApp(server, '/day/2026-10-26')
    await screen.findByRole('textbox', { name: MONDAY })
    const [separator] = separators()
    if (separator === undefined) throw new Error('No separator below the strip')
    const [stripChild, pagesChild] = [...(separator.parentElement?.children ?? [])].filter((c) =>
      c.classList.contains('split-child'),
    )
    // Stored at 0.1, the strip is drawn at 0.15 of the height, as tall as its content.
    if (stripChild === undefined || pagesChild === undefined) throw new Error('No split children')
    stripChild.getBoundingClientRect = () => ({ width: 1000, height: 90 }) as DOMRect
    pagesChild.getBoundingClientRect = () => ({ width: 1000, height: 510 }) as DOMRect
    expect(separator).toHaveAttribute('aria-valuenow', '10')

    fireEvent.pointerDown(separator, { clientY: 90, pointerId: 1 })
    fireEvent.pointerMove(separator, { clientY: 150, pointerId: 1 })
    expect(separator).toHaveAttribute('aria-valuenow', '25')
    fireEvent.pointerCancel(separator, { pointerId: 1 })

    expect(separator).toHaveAttribute('aria-valuenow', '10')
  })

  it('is not shown by a layout without it', async () => {
    await api.saveSettings(
      settingsWithLayout(
        split('pages', 'row', [note('w', 'week', 0), 1], [note('d', 'day', 0), 1]),
      ),
    )

    renderApp(server, '/day/2026-10-26')

    await screen.findByRole('textbox', { name: MONDAY })
    expect(weekStrip()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('stands vertically beside pages, and is resized like them', async () => {
    await api.saveSettings(
      settingsWithLayout(
        split('pages', 'row', [note('w', 'week', 0), 1], [strip, 1], [note('d', 'day', 0), 1]),
      ),
    )

    renderApp(server, '/day/2026-10-26')

    await screen.findByRole('textbox', { name: MONDAY })
    expect(weekStrip()).toHaveAttribute('data-orientation', 'vertical')
    // One splitter on each side of the strip.
    expect(separators()).toHaveLength(2)
  })

  it('lies across below a page, and selects the day that is clicked', async () => {
    await api.saveSettings(
      settingsWithLayout(split('pages', 'column', [note('d', 'day', 0), 1], [strip, 1])),
    )

    const { user, router } = renderApp(server, '/day/2026-10-26')

    await screen.findByRole('textbox', { name: MONDAY })
    const nav = weekStrip()
    expect(nav).toHaveAttribute('data-orientation', 'horizontal')
    expect(separators()).toHaveLength(1)
    if (nav === null) throw new Error('No week strip')
    await user.click(within(nav).getByRole('link', { name: /^Wed 28/ }))

    expect(router.state.location.pathname).toBe('/day/2026-10-28')
    expect(
      await screen.findByRole('textbox', { name: 'Wednesday, October 28, 2026' }),
    ).toBeInTheDocument()
  })

  it('does not bring back its month when the strip comes back, after a layout without it', async () => {
    await api.saveSettings(settingsWithLayout(note('d', 'day', 0)))
    const { user } = renderApp(server, '/day/2026-10-26')
    await screen.findByRole('textbox', { name: MONDAY })
    // From the keyboard only: a click elsewhere would close the month anyway.
    const showLayout = async (name: string) => {
      screen.getByRole('button', { name: 'Settings' }).focus()
      await user.keyboard('{Enter}')
      const settings = within(await screen.findByRole('dialog', { name: 'Settings' }))
      settings.getByRole('radio', { name }).focus()
      await user.keyboard(' ')
      settings.getByRole('button', { name: 'Close' }).focus()
      await user.keyboard('{Enter}')
      await screen.findByRole('textbox', { name: MONDAY })
    }
    await showLayout('Open planner')
    await user.keyboard('{Meta>}k{/Meta}')
    await user.keyboard('Choose a day{Enter}')
    expect(await screen.findByRole('dialog', { name: 'October 2026' })).toBeInTheDocument()

    await showLayout('Custom layout 1')
    await showLayout('Open planner')

    expect(weekStrip()).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'October 2026' })).not.toBeInTheDocument()
  })

  it.each([
    ['Open planner', undefined, true],
    ['a layout without a strip', note('d', 'day', 0), false],
  ])('offers "Choose a day" in the command palette for %s', async (_, layout, offered) => {
    if (layout !== undefined) await api.saveSettings(settingsWithLayout(layout))
    const { user } = renderApp(server, '/day/2026-10-26')
    await screen.findByRole('textbox', { name: MONDAY })

    await user.keyboard('{Meta>}k{/Meta}')

    const palette = within(await screen.findByRole('dialog', { name: 'Commands' }))
    expect(palette.queryByRole('option', { name: /Choose a day/ }) !== null).toBe(offered)
  })
})
