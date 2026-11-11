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
  const writePage = (key: string, content: string, templateRevision?: number) =>
    api.saveNote('week', key, content, 0, { templateRevision })

  async function openTemplate(user: ReturnType<typeof renderApp>['user']) {
    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Edit week template' }))
    return editor('Week template')
  }

  it('opens the template from the page, and Cancel leaves everything as it was', async () => {
    await api.saveTemplate('week', V1, 0)
    const { user } = renderApp(server, '/day/2026-10-26')

    const template = await openTemplate(user)
    expect(editorText(template)).toBe(V1)
    replaceText(template, 'something else')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(editorText(await editor('Week 44'))).toBe(V1)
    expect(await api.template('week')).toMatchObject({ revision: 1, content: V1 })
  })

  it('starts the first template from the page it is edited on, and links that page to it', async () => {
    await writePage('2026-10-26', lines('## Objectives', '- [x] Ship it', '| Squat | [x] |'))
    const { user, router } = renderApp(server, '/day/2026-10-26')

    const template = await openTemplate(user)
    expect(editorText(template)).toBe(lines('## Objectives', '- [x] Ship it', '| Squat | [x] |'))
    replaceText(template, lines('## Objectives', '| Squat | [ ] |'))
    await user.click(screen.getByRole('button', { name: 'Save template' }))

    expect(await editor('Week 44')).toBeInTheDocument()
    expect(await api.template('week')).toMatchObject({
      revision: 1,
      content: lines('## Objectives', '| Squat | [ ] |'),
    })
    expect(await api.getNote('week', '2026-10-26')).toMatchObject({
      content: lines('## Objectives', '- [x] Ship it', '| Squat | [x] |'),
      templateRevision: 1,
    })
    await act(() => router.navigate('/day/2026-11-02'))
    expect(editorText(await editor('Week 45'))).toBe(lines('## Objectives', '| Squat | [ ] |'))
  })

  it('updates this page and the later pages made from the template, keeping what was written', async () => {
    await api.saveTemplate('week', V1, 0)
    await writePage('2026-10-19', V1, 1)
    await writePage('2026-10-26', V1.replace('| Squat | [ ] |', '| Squat | [x] |'), 1)
    await writePage('2026-11-02', V1, 1)
    await writePage('2026-11-09', 'my own page')
    const { user } = renderApp(server, '/day/2026-10-26')

    replaceText(await openTemplate(user), V2)
    await user.click(screen.getByRole('button', { name: 'Save template' }))

    expect(
      await within(await weekPage()).findByText('Template saved, 2 pages updated.'),
    ).toBeInTheDocument()
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

  it('shows the new template on this page when it was not written yet', async () => {
    await api.saveTemplate('week', V1, 0)
    const { user } = renderApp(server, '/day/2026-10-26')

    replaceText(await openTemplate(user), V2)
    await user.click(screen.getByRole('button', { name: 'Save template' }))

    await waitFor(async () => {
      expect(editorText(await editor('Week 44'))).toBe(V2)
    })
    expect(await api.getNote('week', '2026-10-26')).toBeNull()
  })

  it('lists the pages whose own changes clash with the template change, to decide each one', async () => {
    const squat = '| Squat | [ ] | [ ] |'
    await api.saveTemplate('week', V1, 0)
    await writePage('2026-10-26', V1.replace(squat, '| Squat | [x] | [ ] |'), 1)
    await writePage('2026-11-02', V1.replace(squat, '| Squat | [ ] | [x] |'), 1)
    await writePage('2026-11-09', V1, 1)
    const { user } = renderApp(server, '/day/2026-10-26')

    replaceText(await openTemplate(user), V1.replace(squat, '| Front squat | [ ] | [ ] |'))
    await user.click(screen.getByRole('button', { name: 'Save template' }))

    const list = await screen.findByRole('region', { name: '2 pages need a decision' })
    const week44 = within(list).getByRole('group', { name: /Week 44/ })
    await user.click(within(week44).getByRole('radio', { name: /Keep the template’s version/ }))
    await user.click(within(week44).getByRole('button', { name: 'Save' }))
    const week45 = within(list).getByRole('group', { name: /Week 45/ })
    await user.click(within(week45).getByRole('button', { name: 'Leave this page as it is' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /decision/ })).toBeNull()
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
    await user.click(screen.getByRole('button', { name: 'Save template' }))
    const conflict = await screen.findByRole('group', { name: 'The template changed elsewhere' })
    await user.click(within(conflict).getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      expect(await api.template('week')).toMatchObject({
        revision: 3,
        content: V1.replace('## Objectives', '## Aims\n## Goals'),
      })
    })
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

    it('is no longer on the pages', async () => {
      renderApp(server, '/day/2026-10-27')
      await screen.findByRole('textbox', { name: 'Week 44' })

      expect(screen.queryByRole('button', { name: /template/ })).not.toBeInTheDocument()
    })

    it('stays open with its unsaved text when going to another day of the same week', async () => {
      const { user, router } = renderApp(server, '/day/2026-10-27')
      await user.click(await screen.findByRole('button', { name: 'Settings' }))
      await user.click(screen.getByRole('button', { name: 'Edit week template' }))
      replaceText(await editor('Week template'), 'unsaved draft')

      await act(() => router.navigate('/day/2026-10-28'))

      expect(editorText(await editor('Week template'))).toBe('unsaved draft')
    })

    it.each([
      ['day', '2026-10-27', '2026-10-28', 'Day template'],
      ['week', '2026-10-27', '2026-11-03', 'Week template'],
    ])(
      'stays open with its unsaved text when going to another %s',
      async (kind, from, away, name) => {
        const { user, router } = renderApp(server, `/day/${from}`)
        await user.click(await screen.findByRole('button', { name: 'Settings' }))
        await user.click(screen.getByRole('button', { name: `Edit ${kind} template` }))
        replaceText(await editor(name), 'draft')

        await act(() => router.navigate(`/day/${away}`))

        expect(editorText(await editor(name))).toBe('draft')
      },
    )

    it('is not closed by a save that finishes after another page opened its own', async () => {
      let release = (): void => undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const held = {
        ...server,
        fetch: (async (input, init) => {
          const saving = input.includes('/api/templates/') && init?.method === 'PUT'
          if (saving) await gate
          return server.fetch(input, init)
        }) as typeof server.fetch,
      }
      const { user, router } = renderApp(held, '/day/2026-10-27')
      await user.click(await screen.findByRole('button', { name: 'Settings' }))
      await user.click(screen.getByRole('button', { name: 'Edit week template' }))
      replaceText(await editor('Week template'), 'first')
      await user.click(screen.getByRole('button', { name: 'Save template' }))
      await act(() => router.navigate('/day/2026-11-03'))
      await user.keyboard('{Meta>}k{/Meta}')
      await user.type(
        screen.getByRole('combobox', { name: 'Search commands' }),
        'edit week template{Enter}',
      )
      await editor('Week template')

      release()
      await waitFor(async () => {
        expect((await api.template('week'))?.content).toBe('first')
      })
      await act(() => new Promise((resolve) => setTimeout(resolve, 300)))

      expect(screen.getByRole('textbox', { name: 'Week template' })).toBeInTheDocument()
    })

    const openFromSettings = async (
      user: ReturnType<typeof renderApp>['user'],
      kind: 'day' | 'week',
    ) => {
      await user.click(await screen.findByRole('button', { name: 'Settings' }))
      await user.click(screen.getByRole('button', { name: `Edit ${kind} template` }))
    }

    it('keeps its unsaved text when it is opened again from another day', async () => {
      const { user, router } = renderApp(server, '/day/2026-10-27')
      await openFromSettings(user, 'day')
      replaceText(await editor('Day template'), 'unsaved draft')
      await act(() => router.navigate('/day/2026-10-28'))

      await openFromSettings(user, 'day')

      expect(editorText(await editor('Day template'))).toBe('unsaved draft')
    })

    it('keeps the unsaved day template when the week template is opened too', async () => {
      const { user } = renderApp(server, '/day/2026-10-27')
      await openFromSettings(user, 'day')
      replaceText(await editor('Day template'), 'unsaved draft')

      await openFromSettings(user, 'week')

      expect(await editor('Week template')).toBeInTheDocument()
      expect(editorText(await editor('Day template'))).toBe('unsaved draft')
    })

    it('starts the first template from the page it was opened on, wherever you go next', async () => {
      await api.saveNote('day', '2026-10-27', 'tuesday text', 0)
      await api.saveNote('day', '2026-10-28', 'wednesday text', 0)
      const { user, router } = renderApp(server, '/day/2026-10-27')
      await openFromSettings(user, 'day')
      expect(editorText(await editor('Day template'))).toBe('tuesday text')

      await act(() => router.navigate('/day/2026-10-28'))

      expect(editorText(await editor('Day template'))).toBe('tuesday text')
      await user.click(screen.getByRole('button', { name: 'Save template' }))
      await waitFor(async () => {
        expect(await api.template('day')).toMatchObject({ content: 'tuesday text' })
        expect(await api.getNote('day', '2026-10-27')).toMatchObject({ templateRevision: 1 })
      })
      expect(await api.getNote('day', '2026-10-28')).toMatchObject({ templateRevision: null })
    })

    it('links a week page written before the week start changed to its first template', async () => {
      // Written when weeks started on Monday; with Sunday weeks it shows in the week of Oct 25.
      await api.saveNote('week', '2026-10-26', 'old week page', 0)
      await api.saveSettings({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })
      const { user } = renderApp(server, '/day/2026-10-27')
      await openFromSettings(user, 'week')
      const template = await editor('Week template')
      expect(editorText(template)).toBe('old week page')
      expect(template).toHaveFocus()

      await user.click(screen.getByRole('button', { name: 'Save template' }))

      await waitFor(async () => {
        expect(await api.getNote('week', '2026-10-26')).toMatchObject({ templateRevision: 1 })
      })
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

    it('is not offered for a page the layout does not show', async () => {
      const dayOnly = {
        type: 'panel',
        id: 'day',
        panel: { type: 'note', kind: 'day', offset: 0 },
      } as const
      await api.saveSettings(settingsWithLayout(dayOnly))
      const { user } = renderApp(server, '/day/2026-10-27')
      await user.click(await screen.findByRole('button', { name: 'Settings' }))
      const dialog = screen.getByRole('dialog', { name: 'Settings' })
      expect(within(dialog).getByRole('button', { name: 'Edit day template' })).toBeVisible()
      expect(within(dialog).queryByRole('button', { name: 'Edit week template' })).toBeNull()
      await user.click(within(dialog).getByRole('button', { name: 'Close' }))

      await user.keyboard('{Meta>}k{/Meta}')
      await user.type(screen.getByRole('combobox', { name: 'Search commands' }), 'template')

      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Edit day template'])
    })
  })
})
