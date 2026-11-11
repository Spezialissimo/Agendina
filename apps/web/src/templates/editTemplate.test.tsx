import { DEFAULT_SETTINGS } from '@agendina/contract'
import { US_WEEK } from '@agendina/core'
import { screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { editorText, replaceText } from '../test/editor.ts'
import { renderApp } from '../test/render.tsx'
import { settingsWithLayout } from '../test/settings.ts'
import { startTestServer, type TestServer } from '../test/server.ts'

const lines = (...ls: string[]) => ls.join('\n')

const V1 = lines(
  '## Objectives',
  '',
  '| Exercise | Mo | We |',
  '|---|---|---|',
  '| Squat | [ ] | [ ] |',
)
const V2 = `${V1}\n| Bench | [ ] | [ ] |`

const NEXT_DAY = '{Meta>}{Shift>}[Period]{/Shift}{/Meta}'

type User = ReturnType<typeof renderApp>['user']

describe('editing a template', () => {
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

  const weekPage = () => screen.findByRole('region', { name: 'Week 44' })
  const editor = (name: string) => screen.findByRole('textbox', { name })
  const popup = (name: string) => screen.findByRole('dialog', { name })
  const writePage = (kind: 'day' | 'week', key: string, content: string, revision?: number) =>
    api.saveNote(kind, key, content, 0, { templateRevision: revision })

  async function openTemplate(user: User, kind: 'day' | 'week' = 'week') {
    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: `Edit ${kind} template` }))
    return editor(kind === 'day' ? 'Day template' : 'Week template')
  }

  it('opens in a pop-up, and Cancel leaves everything as it was', async () => {
    await api.saveTemplate('week', V1, 0)
    const { user } = renderApp(server, '/day/2026-10-26')

    const template = await openTemplate(user)
    const dialog = await popup('Week template')
    expect(dialog).toContainElement(template)
    expect(editorText(template)).toBe(V1)
    replaceText(template, 'something else')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Week template' })).toBeNull()
    expect(editorText(await editor('Week 44'))).toBe(V1)
    expect(await api.template('week')).toMatchObject({ revision: 1, content: V1 })
  })

  it('closes with Escape without saving', async () => {
    await api.saveTemplate('week', V1, 0)
    const { user } = renderApp(server, '/day/2026-10-26')
    replaceText(await openTemplate(user), 'something else')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Week template' })).toBeNull()
    expect(await api.template('week')).toMatchObject({ revision: 1, content: V1 })
  })

  it('starts the first template empty, and leaves the pages already written alone', async () => {
    await writePage('week', '2026-10-26', lines('## Objectives', '- [x] Ship it'))
    const { user, router } = renderApp(server, '/day/2026-10-26')

    const template = await openTemplate(user)
    expect(editorText(template)).toBe('')
    replaceText(template, lines('## Objectives', '| Squat | [ ] |'))
    await user.click(screen.getByRole('button', { name: 'Save and apply from week 44' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Week template' })).toBeNull()
    })
    expect(await api.template('week')).toMatchObject({
      revision: 1,
      content: lines('## Objectives', '| Squat | [ ] |'),
    })
    expect(await api.getNote('week', '2026-10-26')).toMatchObject({
      content: lines('## Objectives', '- [x] Ship it'),
      templateRevision: null,
    })
    await act(() => router.navigate('/day/2026-11-02'))
    expect(editorText(await editor('Week 45'))).toBe(lines('## Objectives', '| Squat | [ ] |'))
  })

  it('updates the selected page and the later pages made from the template, keeping what was written', async () => {
    await api.saveTemplate('week', V1, 0)
    await writePage('week', '2026-10-19', V1, 1)
    await writePage('week', '2026-10-26', V1.replace('| Squat | [ ] |', '| Squat | [x] |'), 1)
    await writePage('week', '2026-11-02', V1, 1)
    await writePage('week', '2026-11-09', 'my own page')
    const { user } = renderApp(server, '/day/2026-10-26')

    replaceText(await openTemplate(user), V2)
    await user.click(screen.getByRole('button', { name: 'Save and apply from week 44' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Week template' })).toBeNull()
    })
    // The pages show the change itself; no message is left on them.
    expect(within(await weekPage()).queryByText(/Template saved/)).toBeNull()
    await waitFor(async () => {
      expect(editorText(await editor('Week 44'))).toBe(
        V2.replace('| Squat | [ ] |', '| Squat | [x] |'),
      )
    })
    expect(await api.getNote('week', '2026-10-26')).toMatchObject({
      content: V2.replace('| Squat | [ ] |', '| Squat | [x] |'),
      templateRevision: 2,
    })
    expect(await api.getNote('week', '2026-11-02')).toMatchObject({
      content: V2,
      templateRevision: 2,
    })
    expect(await api.getNote('week', '2026-10-19')).toMatchObject({
      content: V1,
      templateRevision: 1,
    })
    expect((await api.getNote('week', '2026-11-09'))?.content).toBe('my own page')
  })

  it('shows the new template on the selected page when it was not written yet', async () => {
    await api.saveTemplate('week', V1, 0)
    const { user } = renderApp(server, '/day/2026-10-26')

    replaceText(await openTemplate(user), V2)
    await user.click(screen.getByRole('button', { name: 'Save and apply from week 44' }))

    await waitFor(async () => {
      expect(editorText(await editor('Week 44'))).toBe(V2)
    })
    expect(await api.getNote('week', '2026-10-26')).toBeNull()
  })

  describe('applying from another page', () => {
    it('applies from the day picked in the calendar, wherever it is', async () => {
      await api.saveTemplate('day', 'v1', 0)
      await writePage('day', '2026-10-27', 'v1', 1)
      await writePage('day', '2026-10-28', 'v1', 1)
      await writePage('day', '2026-11-30', 'v1', 1)
      const { user } = renderApp(server, '/day/2026-10-27')
      replaceText(await openTemplate(user, 'day'), 'v2')
      const dialog = await popup('Day template')
      expect(
        within(dialog).getByRole('button', { name: 'Save and apply from Oct 27, 2026' }),
      ).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Choose the first day' }))
      await user.click(within(dialog).getByRole('button', { name: 'October 28, 2026' }))
      await user.click(
        within(dialog).getByRole('button', { name: 'Save and apply from Oct 28, 2026' }),
      )

      await waitFor(async () => {
        expect(await api.getNote('day', '2026-10-28')).toMatchObject({
          content: 'v2',
          templateRevision: 2,
        })
      })
      expect(await api.getNote('day', '2026-11-30')).toMatchObject({ content: 'v2' })
      expect(await api.getNote('day', '2026-10-27')).toMatchObject({
        content: 'v1',
        templateRevision: 1,
      })
    })

    it('picks a whole week, a row of the month, for the week template', async () => {
      await api.saveTemplate('week', 'v1', 0)
      await writePage('week', '2026-10-26', 'v1', 1)
      await writePage('week', '2026-11-02', 'v1', 1)
      const { user } = renderApp(server, '/day/2026-10-27')
      replaceText(await openTemplate(user), 'v2')
      const dialog = await popup('Week template')

      await user.click(within(dialog).getByRole('button', { name: 'Choose the first week' }))
      const weeks = within(dialog).getByRole('group', { name: 'Apply from week' })
      expect(within(weeks).getByRole('button', { name: /^Week 44,/ })).toHaveAttribute(
        'aria-current',
        'true',
      )
      expect(within(weeks).queryByRole('button', { name: 'October 28, 2026' })).toBeNull()
      await user.click(within(weeks).getByRole('button', { name: 'Next month' }))
      await user.click(within(weeks).getByRole('button', { name: /^Week 45, Nov 2/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Save and apply from week 45' }))

      await waitFor(async () => {
        expect(await api.getNote('week', '2026-11-02')).toMatchObject({ content: 'v2' })
      })
      expect(await api.getNote('week', '2026-10-26')).toMatchObject({ content: 'v1' })
    })

    it('leaves the pages before it as they were, empty ones too', async () => {
      await api.saveTemplate('week', 'v1', 0)
      await writePage('week', '2026-10-19', 'v1, ticked', 1)
      const { user, router } = renderApp(server, '/day/2026-10-27')
      replaceText(await openTemplate(user), 'v2')
      const dialog = await popup('Week template')

      await user.click(within(dialog).getByRole('button', { name: 'Choose the first week' }))
      await user.click(within(dialog).getByRole('button', { name: 'Next month' }))
      await user.click(within(dialog).getByRole('button', { name: /^Week 46,/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Save and apply from week 46' }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Week template' })).toBeNull()
      })

      // Week 44, empty, is on screen: it keeps showing the template it had.
      expect(editorText(await editor('Week 44'))).toBe('v1')
      await act(() => router.navigate('/day/2026-11-03'))
      expect(editorText(await editor('Week 45'))).toBe('v1')
      await act(() => router.navigate('/day/2026-11-10'))
      expect(editorText(await editor('Week 46'))).toBe('v2')
      expect(await api.getNote('week', '2026-10-19')).toMatchObject({ content: 'v1, ticked' })
    })

    it('leaves the empty pages before the first template empty', async () => {
      const { user, router } = renderApp(server, '/day/2026-10-27')
      replaceText(await openTemplate(user), 'v1')
      const dialog = await popup('Week template')
      await user.click(within(dialog).getByRole('button', { name: 'Choose the first week' }))
      await user.click(within(dialog).getByRole('button', { name: 'Next month' }))
      await user.click(within(dialog).getByRole('button', { name: /^Week 46,/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Save and apply from week 46' }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Week template' })).toBeNull()
      })

      expect(editorText(await editor('Week 44'))).toBe('')
      await act(() => router.navigate('/day/2026-11-10'))
      expect(editorText(await editor('Week 46'))).toBe('v1')
    })

    it('reaches a week page written before the week start changed', async () => {
      // Written when weeks started on Monday; with Sunday weeks it shows in the week of Oct 25.
      await api.saveTemplate('week', 'v1', 0)
      await writePage('week', '2026-10-26', 'v1', 1)
      await api.saveSettings({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })
      const { user } = renderApp(server, '/day/2026-10-27')

      replaceText(await openTemplate(user), 'v2')
      await user.click(screen.getByRole('button', { name: 'Save and apply from week 44' }))

      await waitFor(async () => {
        expect(await api.getNote('week', '2026-10-26')).toMatchObject({ content: 'v2' })
      })
    })
  })

  it('lists the pages whose own changes clash with the template change, to decide each one', async () => {
    const squat = '| Squat | [ ] | [ ] |'
    await api.saveTemplate('week', V1, 0)
    await writePage('week', '2026-10-26', V1.replace(squat, '| Squat | [x] | [ ] |'), 1)
    await writePage('week', '2026-11-02', V1.replace(squat, '| Squat | [ ] | [x] |'), 1)
    await writePage('week', '2026-11-09', V1, 1)
    const { user } = renderApp(server, '/day/2026-10-26')

    replaceText(await openTemplate(user), V1.replace(squat, '| Front squat | [ ] | [ ] |'))
    await user.click(screen.getByRole('button', { name: 'Save and apply from week 44' }))

    const dialog = await popup('Week template')
    const list = await within(dialog).findByRole('region', { name: '2 pages need a decision' })
    const week44 = within(list).getByRole('group', { name: /Week 44/ })
    await user.click(within(week44).getByRole('radio', { name: /Keep the template’s version/ }))
    await user.click(within(week44).getByRole('button', { name: 'Save' }))
    const week45 = within(list).getByRole('group', { name: /Week 45/ })
    await user.click(within(week45).getByRole('button', { name: 'Leave this page as it is' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Week template' })).toBeNull()
    })
    expect(await api.getNote('week', '2026-10-26')).toMatchObject({
      content: V1.replace(squat, '| Front squat | [ ] | [ ] |'),
      templateRevision: 2,
    })
    expect(await api.getNote('week', '2026-11-02')).toMatchObject({
      content: V1.replace(squat, '| Squat | [ ] | [x] |'),
      templateRevision: 1,
    })
    expect(await api.getNote('week', '2026-11-09')).toMatchObject({
      content: V1.replace(squat, '| Front squat | [ ] | [ ] |'),
      templateRevision: 2,
    })
    await waitFor(async () => {
      expect(editorText(await editor('Week 44'))).toBe(
        V1.replace(squat, '| Front squat | [ ] | [ ] |'),
      )
    })
  })

  it('asks how to combine the template when it was changed elsewhere meanwhile', async () => {
    await api.saveTemplate('week', V1, 0)
    const { user } = renderApp(server, '/day/2026-10-26')
    const template = await openTemplate(user)
    await api.saveTemplate('week', V1.replace('## Objectives', '## Goals'), 1) // the phone

    replaceText(template, V1.replace('## Objectives', '## Aims'))
    await user.click(screen.getByRole('button', { name: 'Save and apply from week 44' }))
    const conflict = await screen.findByRole('group', { name: 'The template changed elsewhere' })
    await user.click(within(conflict).getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      expect(await api.template('week')).toMatchObject({
        revision: 3,
        content: V1.replace('## Objectives', '## Aims\n## Goals'),
      })
    })
  })

  it('keeps the planner where it is while open: shortcuts do not move to another day', async () => {
    const { user, router } = renderApp(server, '/day/2026-10-27')
    await openTemplate(user, 'day')

    await user.keyboard(NEXT_DAY)

    expect(router.state.location.pathname).toBe('/day/2026-10-27')
  })

  describe('where it is offered', () => {
    it('is in Settings, which closes when a template is chosen: day', async () => {
      const { user } = renderApp(server, '/day/2026-10-27')
      await user.click(await screen.findByRole('button', { name: 'Settings' }))
      const dialog = screen.getByRole('dialog', { name: 'Settings' })
      expect(within(dialog).getByRole('group', { name: 'Templates' })).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Edit day template' }))

      expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
      expect(await editor('Day template')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Week template' })).not.toBeInTheDocument()
    })

    it('is in Settings, which closes when a template is chosen: week', async () => {
      const { user } = renderApp(server, '/day/2026-10-27')
      await user.click(await screen.findByRole('button', { name: 'Settings' }))

      await user.click(screen.getByRole('button', { name: 'Edit week template' }))

      expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
      expect(await editor('Week template')).toBeInTheDocument()
    })

    it.each([
      ['day', 'Day template'],
      ['week', 'Week template'],
    ])('is in the command palette: %s', async (kind, name) => {
      const { user } = renderApp(server, '/day/2026-10-27')
      await screen.findByRole('navigation', { name: 'Week' })

      await user.keyboard('{Meta>}k{/Meta}')
      await user.type(
        screen.getByRole('combobox', { name: 'Search commands' }),
        `edit ${kind} template{Enter}`,
      )

      expect(await editor(name)).toBeInTheDocument()
    })

    it('is not on the pages', async () => {
      renderApp(server, '/day/2026-10-27')
      await screen.findByRole('textbox', { name: 'Week 44' })

      expect(screen.queryByRole('button', { name: /template/ })).not.toBeInTheDocument()
    })

    it('puts the cursor in the template editor, from Settings and from the palette', async () => {
      const { user } = renderApp(server, '/day/2026-10-27')
      await user.click(await screen.findByRole('button', { name: 'Settings' }))
      await user.click(screen.getByRole('button', { name: 'Edit day template' }))
      expect(await editor('Day template')).toHaveFocus()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await user.keyboard('{Meta>}k{/Meta}')
      await user.type(
        screen.getByRole('combobox', { name: 'Search commands' }),
        'edit week template{Enter}',
      )

      expect(await editor('Week template')).toHaveFocus()
    })

    it('is offered for both kinds even when the layout shows no page of one', async () => {
      const dayOnly = {
        type: 'panel',
        id: 'day',
        panel: { type: 'note', kind: 'day', offset: 0 },
      } as const
      await api.saveSettings(settingsWithLayout(dayOnly))
      const { user } = renderApp(server, '/day/2026-10-27')
      await user.click(await screen.findByRole('button', { name: 'Settings' }))
      const dialog = screen.getByRole('dialog', { name: 'Settings' })

      await user.click(within(dialog).getByRole('button', { name: 'Edit week template' }))

      expect(
        await screen.findByRole('button', { name: 'Save and apply from week 44' }),
      ).toBeInTheDocument()
    })
  })
})
