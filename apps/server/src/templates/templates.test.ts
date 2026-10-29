import {
  ChangesResponse,
  NoteResponse,
  NotesResponse,
  SaveTemplateResponse,
  TemplateConflict,
  TemplateResponse,
  TemplateRevisionResponse,
} from '@agendina/contract'
import { testDatabases } from '@agendina/db/testing'
import { describe, expect, it } from 'vitest'
import { useSignedInServer } from '../testing.ts'

const lines = (...ls: string[]) => ls.join('\n')

const WEEK = lines(
  '## Objectives',
  '',
  '| Exercise | Mo | We |',
  '|---|---|---|',
  '| Squat | [ ] | [ ] |',
)

describe.each(testDatabases())('templates on $kind', ({ create }) => {
  const t = useSignedInServer(create)

  const get = (path: string, as = t.cookie) => t.server.request(path, { cookie: as })
  const putTemplate = (kind: string, content: string, baseRevision: number, as = t.cookie) =>
    t.server.request(`/api/templates/${kind}`, {
      method: 'PUT',
      cookie: as,
      body: { content, baseRevision },
    })
  const saveTemplate = async (kind: string, content: string, baseRevision: number) => {
    const res = await putTemplate(kind, content, baseRevision)
    expect(res.status).toBe(200)
    return SaveTemplateResponse.parse(await res.json())
  }
  const template = async (kind: string, as = t.cookie) =>
    TemplateResponse.parse(await (await get(`/api/templates/${kind}`, as)).json()).template
  const putPage = (
    kind: string,
    key: string,
    body: { content: string; baseRevision: number; templateRevision?: number },
  ) => t.server.request(`/api/notes/${kind}/${key}`, { method: 'PUT', cookie: t.cookie, body })
  const savePage = async (
    kind: string,
    key: string,
    body: { content: string; baseRevision: number; templateRevision?: number },
  ) => (await t.server.saveNote(kind, key, body, t.cookie)).note

  it('requires a signed-in user', async () => {
    expect((await t.server.request('/api/templates/week')).status).toBe(401)
    expect(
      (
        await t.server.request('/api/templates/week', {
          method: 'PUT',
          body: { content: '', baseRevision: 0 },
        })
      ).status,
    ).toBe(401)
    expect((await t.server.request('/api/templates/week/revisions/1')).status).toBe(401)
    expect((await t.server.request('/api/templates/week/pages?from=2026-10-26')).status).toBe(401)
  })

  describe('writing a template', () => {
    it('has no template until the user writes one', async () => {
      expect(await template('week')).toBeNull()
    })

    it('saves a template as revision 1, one per kind of page', async () => {
      const saved = await saveTemplate('week', WEEK, 0)
      await saveTemplate('day', '## Today', 0)

      expect(saved).toEqual({
        merged: false,
        template: {
          kind: 'week',
          content: WEEK,
          revision: 1,
          updatedAt: '2026-10-26T10:00:00.000Z',
        },
      })
      expect(await template('week')).toEqual(saved.template)
      expect(await template('day')).toMatchObject({ content: '## Today', revision: 1 })
    })

    it('merges edits saved meanwhile, like pages', async () => {
      await saveTemplate('week', WEEK, 0)
      await saveTemplate('week', `${WEEK}\n| Bench | [ ] | [ ] |`, 1)

      const saved = await saveTemplate('week', WEEK.replace('Objectives', 'Goals'), 1)

      expect(saved).toMatchObject({
        merged: true,
        template: {
          revision: 3,
          content: `${WEEK.replace('Objectives', 'Goals')}\n| Bench | [ ] | [ ] |`,
        },
      })
    })

    it('answers 409 with both versions when the same lines changed', async () => {
      await saveTemplate('week', WEEK, 0)
      await saveTemplate('week', WEEK.replace('Objectives', 'Goals'), 1)

      const res = await putTemplate('week', WEEK.replace('Objectives', 'Aims'), 1)

      expect(res.status).toBe(409)
      const conflict = TemplateConflict.parse(await res.json())
      expect(conflict.current).toMatchObject({ kind: 'week', revision: 2 })
      expect(conflict.chunks).toContainEqual({
        type: 'conflict',
        base: ['## Objectives'],
        mine: ['## Aims'],
        theirs: ['## Goals'],
      })
    })

    it('keeps every revision readable, for merging pages made from older ones', async () => {
      await saveTemplate('week', 'v1', 0)
      await saveTemplate('week', 'v2', 1)

      const res = await get('/api/templates/week/revisions/1')

      expect(res.status).toBe(200)
      expect(TemplateRevisionResponse.parse(await res.json())).toEqual({
        revision: 1,
        content: 'v1',
      })
      expect((await get('/api/templates/week/revisions/3')).status).toBe(404)
      expect((await get('/api/templates/day/revisions/1')).status).toBe(404)
    })

    it('keeps each user’s templates private', async () => {
      await t.server.request('/api/admin/settings', {
        method: 'PUT',
        cookie: t.cookie,
        body: { signupOpen: true },
      })
      const other = await t.server.signup('other@example.com')
      await saveTemplate('week', WEEK, 0)

      expect(await template('week', other)).toBeNull()
      expect((await get('/api/templates/week/revisions/1', other)).status).toBe(404)
    })

    it.each([
      ['an unknown kind', '/api/templates/month'],
      ['an unknown kind for revisions', '/api/templates/month/revisions/1'],
      ['a revision that is not a number', '/api/templates/week/revisions/one'],
      ['pages without a start day', '/api/templates/week/pages'],
    ])('rejects %s', async (_, path) => {
      expect((await get(path)).status).toBe(400)
    })
  })

  describe('pages made from a template', () => {
    it('records the template revision a page was created from', async () => {
      await saveTemplate('week', WEEK, 0)

      const page = await savePage('week', '2026-10-26', {
        content: WEEK,
        baseRevision: 0,
        templateRevision: 1,
      })

      expect(page.templateRevision).toBe(1)
      expect(typeof page.templateId).toBe('string')
      expect(
        NoteResponse.parse(await (await get('/api/notes/week/2026-10-26')).json()).note,
      ).toMatchObject({ templateRevision: 1 })
    })

    it('keeps the template revision when the page is edited later', async () => {
      await saveTemplate('week', WEEK, 0)
      await savePage('week', '2026-10-26', { content: WEEK, baseRevision: 0, templateRevision: 1 })

      const page = await savePage('week', '2026-10-26', {
        content: `${WEEK}\nnotes`,
        baseRevision: 1,
      })

      expect(page).toMatchObject({ revision: 2, templateRevision: 1 })
    })

    it('moves a page to a newer template revision, even when its text stays the same', async () => {
      await saveTemplate('week', WEEK, 0)
      await savePage('week', '2026-10-26', { content: WEEK, baseRevision: 0, templateRevision: 1 })
      await saveTemplate('week', `${WEEK}\n`, 1)

      const page = await savePage('week', '2026-10-26', {
        content: WEEK,
        baseRevision: 1,
        templateRevision: 2,
      })

      expect(page).toMatchObject({ revision: 2, content: WEEK, templateRevision: 2 })
    })

    it.each([
      ['there is no template', 0, 1],
      ['the revision does not exist yet', 1, 2],
    ])('rejects a template revision when %s', async (_, templates, templateRevision) => {
      if (templates > 0) await saveTemplate('week', WEEK, 0)

      const res = await putPage('week', '2026-10-26', {
        content: WEEK,
        baseRevision: 0,
        templateRevision,
      })

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_template_revision' })
    })

    it('does not mix day and week templates', async () => {
      await saveTemplate('day', '## Today', 0)

      const res = await putPage('week', '2026-10-26', {
        content: '## Today',
        baseRevision: 0,
        templateRevision: 1,
      })

      expect(res.status).toBe(400)
    })

    it('lists the pages made from the template, from a day onwards, in order', async () => {
      await saveTemplate('week', WEEK, 0)
      const fromTemplate = { content: WEEK, baseRevision: 0, templateRevision: 1 }
      await savePage('week', '2027-03-01', fromTemplate)
      await savePage('week', '2026-10-19', fromTemplate)
      await savePage('week', '2026-10-26', fromTemplate)
      await savePage('week', '2026-11-02', { content: 'my own page', baseRevision: 0 })
      await savePage('week', '2026-11-09', fromTemplate)
      await t.server.request('/api/notes/week/2026-11-09?baseRevision=1', {
        method: 'DELETE',
        cookie: t.cookie,
      })

      const res = await get('/api/templates/week/pages?from=2026-10-26')

      expect(res.status).toBe(200)
      expect(NotesResponse.parse(await res.json()).notes.map((n) => n.key)).toEqual([
        '2026-10-26',
        '2027-03-01',
      ])
    })
  })

  it('syncs templates through the changes feed', async () => {
    await saveTemplate('week', WEEK, 0)

    const feed = ChangesResponse.parse(await (await get('/api/changes?since=0')).json())

    expect(feed.changes).toMatchObject([
      { kind: 'template', key: 'week', content: WEEK, revision: 1 },
    ])
  })
})
