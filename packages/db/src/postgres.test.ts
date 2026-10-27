import { sql } from 'kysely'
import pg from 'pg'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type DatabaseHandle } from './connection.ts'

const url = process.env.TEST_POSTGRES_URL

describe.runIf(url !== undefined)('Postgres connections', () => {
  let handle: DatabaseHandle | undefined

  afterEach(async () => {
    await handle?.close()
  })

  it('survives the server closing an idle connection (e.g. a restart), and keeps working', async () => {
    const errors: Error[] = []
    handle = createDatabase(url ?? '', { onConnectionError: (error) => errors.push(error) })
    const result = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(handle.db)

    // The server ends the (now idle) pooled connection, as on a restart or failover.
    const admin = new pg.Client({ connectionString: url })
    await admin.connect()
    await admin.query('select pg_terminate_backend($1)', [result.rows[0]?.pid])
    await admin.end()

    await expect.poll(() => errors.length).toBe(1)
    const { rows } = await sql<{ ok: number }>`select 1 as ok`.execute(handle.db)
    expect(rows).toEqual([{ ok: 1 }])
  })
})
