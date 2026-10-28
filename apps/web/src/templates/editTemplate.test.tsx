import { screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Api } from '../api/client.ts'
import { editorText, replaceText } from '../test/editor.ts'
import { renderApp } from '../test/render.tsx'
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

describe('editing a template from a page', () => {
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
    await user.click(within(await weekPage()).getByRole('button', { name: 'Edit week template' }))
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
})
