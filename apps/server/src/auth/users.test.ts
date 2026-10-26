import type { DatabaseHandle } from '@agendina/db'
import { sql } from 'kysely'
import { testDatabases } from '@agendina/db/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createUser } from './users.ts'

describe.each(testDatabases())('createUser on $kind', ({ create }) => {
  let handle: DatabaseHandle

  beforeEach(async () => {
    handle = await create()
  })

  afterEach(async () => {
    await handle.close()
  })

  it('never makes two admins, even when the first signups run concurrently', async () => {
    const now = new Date('2026-10-26T10:00:00.000Z')
    // Open a pooled connection per signup first (Postgres); otherwise the first transaction finishes
    // on the one warm connection before the others have connected, and they never overlap.
    await Promise.all(Array.from({ length: 8 }, () => sql`select 1`.execute(handle.db)))

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        createUser(handle.db, `user${i}@example.com`, 'hash', now),
      ),
    )

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const users = await handle.db.selectFrom('users').select('role').execute()
    expect(users).toEqual([{ role: 'admin' }])
  })
})
