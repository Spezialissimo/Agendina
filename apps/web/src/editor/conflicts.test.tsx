import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { editorText, replaceText } from '../test/editor.ts'
import { renderApp } from '../test/render.tsx'
import { startTestServer, type TestServer } from '../test/server.ts'

const TODAY = 'Monday, 26 October 2026'

describe('resolving a conflict', () => {
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

  /** Opens today's page on `base`, lets "another device" save `theirs`, then types `mine`. */
  const conflict = async (base: string, theirs: string, mine: string) => {
    await api.saveNote('day', '2026-10-26', base, 0)
    const view = renderApp(server, '/day/2026-10-26')
    const textbox = await screen.findByRole('textbox', { name: TODAY })
    await waitFor(() => {
      expect(editorText(textbox)).toBe(base)
    })
    await api.saveNote('day', '2026-10-26', theirs, 1)
    replaceText(textbox, mine)
    const resolver = await screen.findByRole(
      'group',
      { name: 'This page changed elsewhere' },
      { timeout: 3000 },
    )
    return { ...view, resolver }
  }
  const stored = async () => (await api.getNote('day', '2026-10-26'))?.content
  const editor = () => screen.findByRole('textbox', { name: TODAY })

  it('shows both versions of each clashing part, keeping both by default', async () => {
    const { resolver } = await conflict('Run 5km', 'Run 10km', 'Run 8km')

    const choice = within(resolver).getByRole('radiogroup', { name: 'Change 1 of 1' })
    expect(within(choice).getByRole('radio', { name: /Keep mine/ })).toHaveAccessibleDescription(
      'Run 8km',
    )
    expect(
      within(choice).getByRole('radio', { name: /Keep the other version/ }),
    ).toHaveAccessibleDescription('Run 10km')
    expect(within(choice).getByRole('radio', { name: /Keep both/ })).toBeChecked()
  })

  it.each([
    ['Keep mine', 'Run 8km'],
    ['Keep the other version', 'Run 10km'],
    ['Keep both', 'Run 8km\nRun 10km'],
  ])('%s', async (option, expected) => {
    const { user, resolver } = await conflict('Run 5km', 'Run 10km', 'Run 8km')

    await user.click(within(resolver).getByRole('radio', { name: new RegExp(option) }))
    await user.click(within(resolver).getByRole('button', { name: 'Save' }))

    expect(editorText(await editor())).toBe(expected)
    await waitFor(async () => {
      expect(await stored()).toBe(expected)
    })
    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: TODAY })).getByRole('status'),
      ).toHaveTextContent('Saved')
    })
  })

  it('decides each clashing part separately and keeps the lines around them', async () => {
    const { user, resolver } = await conflict(
      'a\nb\nc\nd\ne',
      'a\nB-other\nc\nD-other\ne',
      'a\nB-mine\nc\nD-mine\ne',
    )

    expect(within(resolver).getAllByRole('radiogroup')).toHaveLength(2)
    expect(within(resolver).getByText('c')).toBeInTheDocument()
    await user.click(
      within(within(resolver).getByRole('radiogroup', { name: 'Change 1 of 2' })).getByRole(
        'radio',
        { name: /Keep mine/ },
      ),
    )
    await user.click(
      within(within(resolver).getByRole('radiogroup', { name: 'Change 2 of 2' })).getByRole(
        'radio',
        { name: /Keep the other version/ },
      ),
    )
    await user.click(within(resolver).getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      expect(await stored()).toBe('a\nB-mine\nc\nD-other\ne')
    })
  })

  it('can discard my version and take the other one', async () => {
    const { user, resolver } = await conflict('Run 5km', 'Run 10km', 'Run 8km')

    await user.click(within(resolver).getByRole('button', { name: 'Discard my version' }))

    expect(editorText(await editor())).toBe('Run 10km')
    expect(await stored()).toBe('Run 10km')
  })

  it('asks again if the page changes once more before saving the resolution', async () => {
    const { user, resolver } = await conflict('Run 5km', 'Run 10km', 'Run 8km')

    await api.saveNote('day', '2026-10-26', 'Run 12km', 2)
    await user.click(within(resolver).getByRole('radio', { name: /Keep mine/ }))
    await user.click(within(resolver).getByRole('button', { name: 'Save' }))

    const again = await screen.findByRole('group', { name: 'This page changed elsewhere' })
    expect(
      within(again).getByRole('radio', { name: /Keep the other version/ }),
    ).toHaveAccessibleDescription('Run 12km')
    expect(await stored()).toBe('Run 12km')
  })
})
