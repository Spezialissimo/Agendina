import { NoteConflict, NoteResponse, NotesResponse } from '@agendina/contract'
import { testDatabases } from '@agendina/db/testing'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { useSignedInServer } from '../testing.ts'

const lines = (...ls: string[]) => ls.join('\n')

describe.each(testDatabases())('notes on $kind', ({ create }) => {
  const t = useSignedInServer(create)

  const get = (path: string, as = t.cookie) => t.server.request(path, { cookie: as })
  const put = (kind: string, key: string, content: string, baseRevision: number, as = t.cookie) =>
    t.server.request(`/api/notes/${kind}/${key}`, {
      method: 'PUT',
      cookie: as,
      body: { content, baseRevision },
    })
  const save = (kind: string, key: string, content: string, baseRevision: number) =>
    t.server.saveNote(kind, key, { content, baseRevision }, t.cookie)

  it('requires a signed-in user', async () => {
    expect((await t.server.request('/api/notes/day/2026-10-26')).status).toBe(401)
    expect(
      (await t.server.request('/api/notes?kind=day&from=2026-10-26&to=2026-10-26')).status,
    ).toBe(401)
    expect(
      (
        await t.server.request('/api/notes/day/2026-10-26', {
          method: 'PUT',
          body: { content: '', baseRevision: 0 },
        })
      ).status,
    ).toBe(401)
  })

  describe('reading and writing', () => {
    it('returns 404 for a page nobody wrote yet', async () => {
      const res = await get('/api/notes/day/2026-10-26')

      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
    })

    it('creates a note from base revision 0', async () => {
      const saved = await save('day', '2026-10-26', '- [ ] Finish report', 0)

      expect(saved).toEqual({
        merged: false,
        note: {
          kind: 'day',
          key: '2026-10-26',
          content: '- [ ] Finish report',
          revision: 1,
          templateId: null,
          templateRevision: null,
          updatedAt: '2026-10-26T10:00:00.000Z',
        },
      })
      expect(
        NoteResponse.parse(await (await get('/api/notes/day/2026-10-26')).json()).note,
      ).toEqual(saved.note)
    })

    it('saves an edit of the current revision as the next revision', async () => {
      await save('week', '2026-10-19', 'v1', 0)

      const saved = await save('week', '2026-10-19', 'v2', 1)

      expect(saved.note).toMatchObject({ content: 'v2', revision: 2 })
    })

    it('stores content exactly as written', async () => {
      const content = 'Line with trailing spaces   \r\nWindows line\n\n\n## Città 🏋️\t\n'

      expect((await save('day', '2026-10-26', content, 0)).note.content).toBe(content)
    })

    it('does not create a revision when nothing changed', async () => {
      await save('day', '2026-10-26', 'same', 0)

      const saved = await save('day', '2026-10-26', 'same', 1)

      expect(saved.note.revision).toBe(1)
    })

    it('keeps every revision', async () => {
      await save('day', '2026-10-26', 'v1', 0)
      await save('day', '2026-10-26', 'v2', 1)
      await save('day', '2026-10-26', 'v3', 2)

      const revisions = await t.handle.db
        .selectFrom('note_revisions')
        .select(['revision', 'content'])
        .orderBy('revision')
        .execute()
      expect(revisions).toEqual([
        { revision: 1, content: 'v1' },
        { revision: 2, content: 'v2' },
        { revision: 3, content: 'v3' },
      ])
    })

    it('keeps each user’s notes private', async () => {
      await t.server.request('/api/admin/settings', {
        method: 'PUT',
        cookie: t.cookie,
        body: { signupOpen: true },
      })
      const other = await t.server.signup('other@example.com')
      await save('day', '2026-10-26', 'mine', 0)

      expect((await get('/api/notes/day/2026-10-26', other)).status).toBe(404)
      expect((await put('day', '2026-10-26', 'theirs', 0, other)).status).toBe(200)
      expect(
        NoteResponse.parse(await (await get('/api/notes/day/2026-10-26')).json()).note.content,
      ).toBe('mine')
    })
  })

  describe('saving from a stale revision', () => {
    const base = lines('- [ ] Finish report', '- [ ] Call dentist', '', 'Notes:')

    it('merges edits to different lines', async () => {
      await save('day', '2026-10-26', base, 0)
      await save('day', '2026-10-26', base.replace('[ ] Call', '[x] Call'), 1) // e.g. from the phone

      const saved = await save('day', '2026-10-26', `${base}\nFelt good`, 1) // the laptop was still on 1

      expect(saved).toMatchObject({
        merged: true,
        note: {
          revision: 3,
          content: lines('- [ ] Finish report', '- [x] Call dentist', '', 'Notes:', 'Felt good'),
        },
      })
    })

    it('answers 409 with both versions, and saves nothing, when the same line changed', async () => {
      await save('day', '2026-10-26', base, 0)
      await save('day', '2026-10-26', base.replace('Finish report', 'Finish report today'), 1)

      const res = await put('day', '2026-10-26', base.replace('Finish report', 'Send report'), 1)

      expect(res.status).toBe(409)
      const conflict = NoteConflict.parse(await res.json())
      expect(conflict.current).toMatchObject({ revision: 2 })
      expect(conflict.chunks).toContainEqual({
        type: 'conflict',
        base: ['- [ ] Finish report'],
        mine: ['- [ ] Send report'],
        theirs: ['- [ ] Finish report today'],
      })
      const stored = NoteResponse.parse(await (await get('/api/notes/day/2026-10-26')).json()).note
      expect(stored).toMatchObject({
        revision: 2,
        content: base.replace('Finish report', 'Finish report today'),
      })
    })

    it('treats a second "first write" as an edit of the empty page', async () => {
      await save('day', '2026-10-26', 'from the phone', 0)

      const res = await put('day', '2026-10-26', 'from the laptop', 0)

      expect(res.status).toBe(409)
      expect(NoteConflict.parse(await res.json()).current.content).toBe('from the phone')
    })

    it('rejects a base revision from the future', async () => {
      await save('day', '2026-10-26', 'v1', 0)

      const res = await put('day', '2026-10-26', 'v?', 5)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_base_revision' })
    })

    it('loses no edit when saves from the same base arrive concurrently', async () => {
      const original = Array.from({ length: 6 }, (_, i) => `- [ ] task ${i}`)
      await save('day', '2026-10-26', original.join('\n'), 0)
      await Promise.all(Array.from({ length: 6 }, () => sql`select 1`.execute(t.handle.db)))

      const results = await Promise.all(
        original.map((_, i) =>
          put(
            'day',
            '2026-10-26',
            original.map((l, j) => (j === i ? l.replace('[ ]', '[x]') : l)).join('\n'),
            1,
          ),
        ),
      )

      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200])
      const stored = NoteResponse.parse(await (await get('/api/notes/day/2026-10-26')).json()).note
      expect(stored.content).toBe(original.map((l) => l.replace('[ ]', '[x]')).join('\n'))
      expect(stored.revision).toBe(7)
    })
  })

  describe('listing a range', () => {
    it('lists the notes of one kind between two days, inclusive, in order', async () => {
      await save('day', '2026-10-27', 'tue', 0)
      await save('day', '2026-10-25', 'sun', 0)
      await save('day', '2026-10-19', 'mon', 0)
      await save('day', '2026-10-28', 'next week', 0)
      await save('week', '2026-10-19', 'week', 0)

      const res = await get('/api/notes?kind=day&from=2026-10-19&to=2026-10-27')

      expect(NotesResponse.parse(await res.json()).notes.map((n) => n.content)).toEqual([
        'mon',
        'sun',
        'tue',
      ])
    })

    it.each([
      ['a missing kind', '/api/notes?from=2026-10-19&to=2026-10-25'],
      ['an invalid day', '/api/notes?kind=day&from=2026-13-01&to=2026-10-25'],
      ['a reversed range', '/api/notes?kind=day&from=2026-10-25&to=2026-10-19'],
      ['a range over a year', '/api/notes?kind=day&from=2025-01-01&to=2026-10-25'],
    ])('rejects %s', async (_, path) => {
      const res = await get(path)

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'invalid_request' })
    })
  })

  describe('validation', () => {
    it.each([
      ['an unknown kind', '/api/notes/month/2026-10-01'],
      ['an invalid day', '/api/notes/day/2026-02-30'],
    ])('rejects %s', async (_, path) => {
      expect((await get(path)).status).toBe(400)
      expect(
        (
          await t.server.request(path, {
            method: 'PUT',
            cookie: t.cookie,
            body: { content: '', baseRevision: 0 },
          })
        ).status,
      ).toBe(400)
    })

    it('refuses request bodies over 4 MB before reading them', async () => {
      const res = await put('day', '2026-10-26', 'x'.repeat(5 * 1024 * 1024), 0)

      expect(res.status).toBe(413)
      expect(await res.json()).toEqual({ error: 'payload_too_large' })
    })

    it('rejects notes larger than 1 MB', async () => {
      const res = await put('day', '2026-10-26', 'x'.repeat(1_000_001), 0)

      expect(res.status).toBe(400)
    })
  })
})
