import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMANDS } from '../commands/registry.ts'
import { placeCursor } from '../test/editor.ts'
import { renderApp } from '../test/render.tsx'
import { startTestServer, type TestServer } from '../test/server.ts'
import { forgetUnsavedTextSizes } from './textSize.ts'

// Text size is a per-device preference: it lives in localStorage, one entry per page kind.
const DAY_KEY = 'agendina.textSize.day'
const WEEK_KEY = 'agendina.textSize.week'

describe('text size', () => {
  let server: TestServer

  beforeEach(async () => {
    localStorage.clear()
    server = await startTestServer()
    await server.signup()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    forgetUnsavedTextSizes()
    localStorage.clear()
    await server.close()
  })

  const DAY = 'Monday, October 26, 2026'
  const WEEK = 'Week 44'

  const open = async (path = '/day/2026-10-26') => {
    const view = renderApp(server, path)
    await screen.findByRole('textbox', { name: DAY })
    await screen.findByRole('textbox', { name: WEEK })
    return view
  }
  const page = (name: string) => screen.getByRole('region', { name })
  const button = (name: string) =>
    within(page(name)).getByRole('button', { name: /^Aa, text size: / })
  const size = (name: string) => page(name).getAttribute('data-text-size')

  it('starts at Medium and says so', async () => {
    await open()

    expect(button(DAY)).toHaveAccessibleName('Aa, text size: Medium')
    expect(button(DAY)).toHaveTextContent('Aa')
    expect(size(DAY)).toBe('medium')
  })

  it('cycles Small, Medium, Large and back, announcing the size each time', async () => {
    const { user } = await open()

    await user.click(button(DAY))
    expect(button(DAY)).toHaveAccessibleName('Aa, text size: Large')
    expect(size(DAY)).toBe('large')

    await user.click(button(DAY))
    expect(button(DAY)).toHaveAccessibleName('Aa, text size: Small')
    expect(size(DAY)).toBe('small')

    await user.click(button(DAY))
    expect(button(DAY)).toHaveAccessibleName('Aa, text size: Medium')
    expect(size(DAY)).toBe('medium')
  })

  it('sizes the day page and the week page separately', async () => {
    const { user } = await open()

    await user.click(button(DAY))
    expect(size(DAY)).toBe('large')
    expect(size(WEEK)).toBe('medium')

    await user.click(button(WEEK))
    await user.click(button(WEEK))
    expect(size(WEEK)).toBe('small')
    expect(size(DAY)).toBe('large')
  })

  it('keeps a size while navigating between dates and weeks', async () => {
    const { user, router } = await open()
    await user.click(button(DAY))
    await user.click(button(WEEK))

    await router.navigate('/day/2026-10-27')
    await screen.findByRole('textbox', { name: 'Tuesday, October 27, 2026' })
    expect(size('Tuesday, October 27, 2026')).toBe('large')
    expect(size(WEEK)).toBe('large')

    await router.navigate('/day/2026-11-04')
    await screen.findByRole('textbox', { name: 'Wednesday, November 4, 2026' })
    expect(size('Wednesday, November 4, 2026')).toBe('large')
    expect(size('Week 45')).toBe('large')
  })

  it('remembers the size on this device after a reload', async () => {
    const first = await open()
    await first.user.click(button(DAY))
    await first.user.click(button(WEEK))
    await first.user.click(button(WEEK))
    first.unmount()

    await open()

    expect(button(DAY)).toHaveAccessibleName('Aa, text size: Large')
    expect(button(WEEK)).toHaveAccessibleName('Aa, text size: Small')
  })

  it('stores the size in this browser only, never on the server', async () => {
    const { user } = await open()

    await user.click(button(DAY))

    expect(localStorage.getItem(DAY_KEY)).toBe('large')
    const settings = await server.fetch('/api/settings')
    expect(JSON.stringify(await settings.json())).not.toMatch(/large/i)
  })

  it.each(['huge', '', '{"size":"large"}', 'LARGE'])(
    'falls back to Medium when the stored value is %j',
    async (garbage) => {
      localStorage.setItem(DAY_KEY, garbage)
      localStorage.setItem(WEEK_KEY, garbage)

      await open()

      expect(button(DAY)).toHaveAccessibleName('Aa, text size: Medium')
      expect(size(WEEK)).toBe('medium')
    },
  )

  it('falls back to Medium, and still works, when storage cannot be read or written', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const { user } = await open()
    expect(button(DAY)).toHaveAccessibleName('Aa, text size: Medium')

    await user.click(button(DAY))

    expect(button(DAY)).toHaveAccessibleName('Aa, text size: Large')
    expect(size(DAY)).toBe('large')
  })

  it('still changes the size when storage can be read but not written', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const { user } = await open()

    await user.click(button(DAY))
    expect(button(DAY)).toHaveAccessibleName('Aa, text size: Large')
    expect(size(DAY)).toBe('large')

    await user.click(button(DAY))
    expect(size(DAY)).toBe('small')
  })

  describe('"Text size" command', () => {
    /** Opens the palette, checks it is the one match, without a shortcut, runs it. */
    const runCommand = async (user: ReturnType<typeof renderApp>['user']) => {
      await user.keyboard('{Meta>}{k}{/Meta}')
      await user.keyboard('text size')
      const options = within(screen.getByRole('dialog', { name: 'Commands' })).getAllByRole(
        'option',
      )
      expect(options.map((o) => o.textContent)).toEqual(['Text size (cycle)'])
      await user.keyboard('{Enter}')
    }

    it('has no default shortcut', () => {
      const command = COMMANDS.find((c) => c.id === 'page.nextTextSize')

      expect(command?.defaultBindings).toEqual([])
    })

    it('cycles the day page when no editor has focus', async () => {
      const { user } = await open()

      await runCommand(user)

      expect(size(DAY)).toBe('large')
      expect(size(WEEK)).toBe('medium')
    })

    it('cycles the page whose editor has focus', async () => {
      localStorage.setItem(WEEK_KEY, 'small')
      const { user } = await open()
      placeCursor(screen.getByRole('textbox', { name: WEEK }), 0)

      await runCommand(user)

      expect(size(WEEK)).toBe('medium')
      expect(size(DAY)).toBe('medium')
      expect(button(WEEK)).toHaveAccessibleName('Aa, text size: Medium')
    })

    it('cycles the day page when its editor has focus', async () => {
      localStorage.setItem(DAY_KEY, 'large')
      const { user } = await open()
      placeCursor(screen.getByRole('textbox', { name: DAY }), 0)

      await runCommand(user)

      expect(size(DAY)).toBe('small')
      expect(size(WEEK)).toBe('medium')
    })

    it('acts on the page last focused, though the palette took the focus', async () => {
      const { user } = await open()
      placeCursor(screen.getByRole('textbox', { name: WEEK }), 0)
      await user.keyboard('{Meta>}{k}{/Meta}')
      expect(screen.getByRole('combobox')).toHaveFocus()
      await user.keyboard('{Escape}')

      await runCommand(user)

      expect(size(WEEK)).toBe('large')
      expect(size(DAY)).toBe('medium')
    })
  })
})
