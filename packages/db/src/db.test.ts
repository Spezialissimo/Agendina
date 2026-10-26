import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, migrateToLatest, type DatabaseHandle } from './index.ts'
import { testDatabases } from './testing.ts'

describe('createDatabase', () => {
  it.each(['mysql://localhost/db', 'agendina.db', ''])('rejects the unsupported URL %j', (url) => {
    expect(() => createDatabase(url)).toThrow(/Unsupported database URL/)
  })

  it('opens an in-memory SQLite database', async () => {
    const handle = createDatabase('sqlite::memory:')
    expect(handle.kind).toBe('sqlite')
    await handle.close()
  })
})

describe.each(testDatabases())('$kind database', ({ create }) => {
  let handle: DatabaseHandle

  beforeEach(async () => {
    handle = await create()
  })

  afterEach(async () => {
    await handle.close()
  })

  const insertUser = (id: string, email = `${id}@example.com`) =>
    handle.db
      .insertInto('users')
      .values({
        id,
        email,
        password_hash: 'hash',
        role: 'member',
        created_at: '2026-10-26T10:00:00.000Z',
      })
      .execute()

  const insertNote = (id: string, userId: string, key = '2026-10-26') =>
    handle.db
      .insertInto('notes')
      .values({
        id,
        user_id: userId,
        kind: 'day',
        key,
        content: '',
        revision: 1,
        change_seq: 1,
        created_at: '2026-10-26T10:00:00.000Z',
        updated_at: '2026-10-26T10:00:00.000Z',
      })
      .execute()

  it('is fully migrated, and migrating again changes nothing', async () => {
    await migrateToLatest(handle.db)

    const tables = [
      'users',
      'sessions',
      'instance_settings',
      'notes',
      'note_revisions',
      'user_settings',
    ] as const
    for (const table of tables) {
      await expect(handle.db.selectFrom(table).selectAll().execute()).resolves.toEqual([])
    }
  })

  it('round-trips text, integers and nulls exactly', async () => {
    await insertUser('u1')
    const content =
      '## Settimana 43 🏋️\n- [x] Città, perché, naïve\n\ttab and "quotes" \\ backslash\n'
    await handle.db
      .insertInto('notes')
      .values({
        id: 'n1',
        user_id: 'u1',
        kind: 'week',
        key: '2026-10-19',
        content,
        revision: 41,
        template_id: null,
        template_revision: null,
        change_seq: 7,
        created_at: '2026-10-26T10:00:00.000Z',
        updated_at: '2026-10-26T10:00:00.000Z',
      })
      .execute()

    const note = await handle.db
      .selectFrom('notes')
      .selectAll()
      .where('id', '=', 'n1')
      .executeTakeFirstOrThrow()

    expect(note).toMatchObject({
      content,
      revision: 41,
      change_seq: 7,
      template_id: null,
      deleted_at: null,
    })
  })

  it('returns rows from INSERT … RETURNING', async () => {
    const row = await handle.db
      .insertInto('users')
      .values({
        id: 'u1',
        email: 'a@example.com',
        password_hash: 'h',
        role: 'admin',
        created_at: '2026-10-26T10:00:00.000Z',
      })
      .returning(['id', 'change_seq'])
      .executeTakeFirstOrThrow()

    expect(row).toEqual({ id: 'u1', change_seq: 0 })
  })

  it('reports affected rows for updates', async () => {
    await insertUser('u1')

    const result = await handle.db
      .updateTable('users')
      .set({ role: 'admin' })
      .where('id', '=', 'u1')
      .executeTakeFirst()

    expect(Number(result.numUpdatedRows)).toBe(1)
  })

  it('keeps emails unique', async () => {
    await insertUser('u1', 'same@example.com')
    await expect(insertUser('u2', 'same@example.com')).rejects.toThrow()
  })

  it('allows one note per user, kind and key', async () => {
    await insertUser('u1')
    await insertUser('u2')
    await insertNote('n1', 'u1')

    await expect(insertNote('n2', 'u1')).rejects.toThrow()
    await expect(insertNote('n3', 'u2')).resolves.toBeDefined()
    await expect(insertNote('n4', 'u1', '2026-10-27')).resolves.toBeDefined()
  })

  it('deletes a user’s notes, revisions and sessions with the user', async () => {
    await insertUser('u1')
    await insertNote('n1', 'u1')
    await handle.db
      .insertInto('note_revisions')
      .values({ note_id: 'n1', revision: 1, content: '', created_at: '2026-10-26T10:00:00.000Z' })
      .execute()
    await handle.db
      .insertInto('sessions')
      .values({
        id: 's1',
        user_id: 'u1',
        created_at: '2026-10-26T10:00:00.000Z',
        expires_at: '2026-11-26T10:00:00.000Z',
      })
      .execute()

    await handle.db.deleteFrom('users').where('id', '=', 'u1').execute()

    await expect(handle.db.selectFrom('notes').selectAll().execute()).resolves.toEqual([])
    await expect(handle.db.selectFrom('note_revisions').selectAll().execute()).resolves.toEqual([])
    await expect(handle.db.selectFrom('sessions').selectAll().execute()).resolves.toEqual([])
  })

  it('rolls back a failed transaction', async () => {
    await insertUser('u1')

    await expect(
      handle.db.transaction().execute(async (trx) => {
        await trx.updateTable('users').set({ role: 'admin' }).where('id', '=', 'u1').execute()
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    const user = await handle.db.selectFrom('users').select('role').executeTakeFirstOrThrow()
    expect(user.role).toBe('member')
  })
})
