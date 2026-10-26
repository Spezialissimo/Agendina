import { ChangesResponse, NoteResponse, SaveNoteResponse } from '@agendina/contract'
import type { DatabaseHandle } from '@agendina/db'
import { testDatabases } from '@agendina/db/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestServer } from '../testing.ts'

describe.each(testDatabases())('sync on $kind', ({ create }) => {
  let handle: DatabaseHandle
  let server: ReturnType<typeof createTestServer>
  let cookie: string

  beforeEach(async () => {
    handle = await create()
    server = createTestServer(handle, { now: () => new Date('2026-10-26T10:00:00.000Z') })
    cookie = await server.signup()
  })

  afterEach(async () => {
    await handle.close()
  })

  const save = async (key: string, content: string, baseRevision: number, as = cookie) => {
    const res = await server.request(`/api/notes/day/${key}`, {
      method: 'PUT',
      cookie: as,
      body: { content, baseRevision },
    })
    expect(res.status).toBe(200)
    return SaveNoteResponse.parse(await res.json()).note
  }
  const remove = (key: string, baseRevision: number) =>
    server.request(`/api/notes/day/${key}?baseRevision=${baseRevision}`, {
      method: 'DELETE',
      cookie,
    })
  const changes = async (query: string, as = cookie) => {
    const res = await server.request(`/api/changes?${query}`, { cookie: as })
    expect(res.status).toBe(200)
    return ChangesResponse.parse(await res.json())
  }
  const summary = (feed: ChangesResponse) =>
    feed.changes.map((c) => `${c.key}@${c.revision}${c.deleted ? ' deleted' : ''}`)

  describe('deleting a note', () => {
    it('removes the page and its text, keeping only a tombstone', async () => {
      await save('2026-10-26', 'secret v1', 0)
      await save('2026-10-26', 'secret v2', 1)

      const res = await remove('2026-10-26', 2)

      expect(res.status).toBe(204)
      expect((await server.request('/api/notes/day/2026-10-26', { cookie })).status).toBe(404)
      const rows = await handle.db
        .selectFrom('notes')
        .select(['content', 'revision', 'deleted_at'])
        .execute()
      expect(rows).toEqual([{ content: '', revision: 3, deleted_at: '2026-10-26T10:00:00.000Z' }])
      const history = await handle.db
        .selectFrom('note_revisions')
        .select(['revision', 'content'])
        .execute()
      expect(history).toEqual([{ revision: 3, content: '' }])
    })

    it('refuses to delete a page that changed since the client last saw it', async () => {
      await save('2026-10-26', 'v1', 0)
      await save('2026-10-26', 'v2', 1)

      const res = await remove('2026-10-26', 1)

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'stale_revision' })
      expect((await server.request('/api/notes/day/2026-10-26', { cookie })).status).toBe(200)
    })

    it('answers 404 for a page that does not exist or is already deleted', async () => {
      expect((await remove('2026-10-26', 1)).status).toBe(404)
      await save('2026-10-26', 'v1', 0)
      await remove('2026-10-26', 1)

      expect((await remove('2026-10-26', 2)).status).toBe(404)
    })

    it('lets the page be written again, continuing its revisions', async () => {
      await save('2026-10-26', 'v1', 0)
      await remove('2026-10-26', 1)

      const note = await save('2026-10-26', 'fresh start', 0)

      expect(note).toMatchObject({ content: 'fresh start', revision: 3 })
      expect(
        NoteResponse.parse(
          await (await server.request('/api/notes/day/2026-10-26', { cookie })).json(),
        ).note.content,
      ).toBe('fresh start')
    })

    it('keeps an edit made on another device before it saw the deletion (edit wins)', async () => {
      await save('2026-10-26', 'v1', 0)
      await remove('2026-10-26', 1)

      const note = await save('2026-10-26', 'v1 edited offline', 1)

      expect(note).toMatchObject({ content: 'v1 edited offline', revision: 3 })
    })

    it.each(['', '?baseRevision=0', '?baseRevision=abc'])(
      'rejects the base revision %j',
      async (query) => {
        await save('2026-10-26', 'v1', 0)

        const res = await server.request(`/api/notes/day/2026-10-26${query}`, {
          method: 'DELETE',
          cookie,
        })

        expect(res.status).toBe(400)
      },
    )
  })

  describe('changes feed', () => {
    it('starts empty', async () => {
      expect(await changes('since=0')).toEqual({ changes: [], cursor: 0, hasMore: false })
    })

    it('lists the latest state of each changed note, oldest change first', async () => {
      await save('2026-10-24', 'a', 0)
      await save('2026-10-25', 'b', 0)
      await save('2026-10-24', 'a2', 1)

      const feed = await changes('since=0')

      expect(summary(feed)).toEqual(['2026-10-25@1', '2026-10-24@2'])
      expect(feed.changes[1]).toMatchObject({ kind: 'day', content: 'a2', deleted: false })
      expect(feed.hasMore).toBe(false)
    })

    it('returns only what changed after the cursor', async () => {
      await save('2026-10-24', 'a', 0)
      const first = await changes('since=0')
      await save('2026-10-25', 'b', 0)

      const next = await changes(`since=${first.cursor}`)

      expect(summary(next)).toEqual(['2026-10-25@1'])
      expect(await changes(`since=${next.cursor}`)).toEqual({
        changes: [],
        cursor: next.cursor,
        hasMore: false,
      })
    })

    it('pages through long feeds', async () => {
      for (let day = 20; day <= 24; day++) await save(`2026-10-${day}`, `day ${day}`, 0)

      const page1 = await changes('since=0&limit=2')
      const page2 = await changes(`since=${page1.cursor}&limit=2`)
      const page3 = await changes(`since=${page2.cursor}&limit=2`)

      expect([summary(page1), summary(page2), summary(page3)]).toEqual([
        ['2026-10-20@1', '2026-10-21@1'],
        ['2026-10-22@1', '2026-10-23@1'],
        ['2026-10-24@1'],
      ])
      expect([page1.hasMore, page2.hasMore, page3.hasMore]).toEqual([true, true, false])
    })

    it('includes deletions without their text', async () => {
      await save('2026-10-24', 'private', 0)
      await remove('2026-10-24', 1)

      const feed = await changes('since=0')

      expect(feed.changes).toEqual([
        expect.objectContaining({ key: '2026-10-24', revision: 2, deleted: true, content: '' }),
      ])
    })

    it('records nothing for saves that change nothing or conflict', async () => {
      await save('2026-10-24', 'line', 0)
      const before = await changes('since=0')

      await save('2026-10-24', 'line', 1)
      await save('2026-10-24', 'line changed', 1)
      const conflict = await server.request('/api/notes/day/2026-10-24', {
        method: 'PUT',
        cookie,
        body: { content: 'line changed differently', baseRevision: 1 },
      })
      expect(conflict.status).toBe(409)

      const after = await changes(`since=${before.cursor}`)
      expect(summary(after)).toEqual(['2026-10-24@2'])
      expect(after.cursor).toBe(before.cursor + 1)
    })

    it('shows each user only their own changes', async () => {
      await server.request('/api/admin/settings', {
        method: 'PUT',
        cookie,
        body: { signupOpen: true },
      })
      const other = await server.signup('other@example.com')
      await save('2026-10-24', 'mine', 0)

      expect(await changes('since=0', other)).toEqual({ changes: [], cursor: 0, hasMore: false })
    })

    it.each(['', 'since=-1', 'since=abc', 'since=0&limit=0', 'since=0&limit=1001'])(
      'rejects %j',
      async (query) => {
        const res = await server.request(`/api/changes?${query}`, { cookie })

        expect(res.status).toBe(400)
      },
    )

    it('requires a signed-in user', async () => {
      expect((await server.request('/api/changes?since=0')).status).toBe(401)
    })
  })
})
