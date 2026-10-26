import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { createDatabase, type DatabaseHandle } from './connection.ts'
import { migrateToLatest } from './migrate.ts'

export interface TestDatabase {
  kind: 'sqlite' | 'postgres'
  /** A fresh, migrated, empty database. */
  create: () => Promise<DatabaseHandle>
}

/**
 * The databases to run a test suite against: in-memory SQLite always, plus Postgres when
 * `TEST_POSTGRES_URL` is set. In CI, Postgres is required so its tests cannot be skipped silently.
 *
 *     describe.each(testDatabases())('$kind', ({ create }) => { … })
 */
export function testDatabases(): TestDatabase[] {
  const postgresUrl = process.env.TEST_POSTGRES_URL
  if (postgresUrl === undefined && process.env.CI !== undefined) {
    throw new Error('TEST_POSTGRES_URL must be set in CI')
  }
  const sqlite: TestDatabase = {
    kind: 'sqlite',
    create: () => migrated(createDatabase('sqlite::memory:')),
  }
  return postgresUrl === undefined
    ? [sqlite]
    : [sqlite, { kind: 'postgres', create: () => freshPostgres(postgresUrl) }]
}

async function migrated(handle: DatabaseHandle): Promise<DatabaseHandle> {
  await migrateToLatest(handle.db)
  return handle
}

/** Creates a throwaway database on the test server, dropped again on close. */
async function freshPostgres(adminUrl: string): Promise<DatabaseHandle> {
  const name = `agendina_test_${randomBytes(6).toString('hex')}`
  await withAdmin(adminUrl, (admin) => admin.query(`CREATE DATABASE ${name}`))

  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  const handle = await migrated(createDatabase(url.toString()))
  return {
    ...handle,
    close: async () => {
      await handle.close()
      await withAdmin(adminUrl, (admin) => admin.query(`DROP DATABASE ${name} WITH (FORCE)`))
    },
  }
}

async function withAdmin(url: string, fn: (client: pg.Client) => Promise<unknown>): Promise<void> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await fn(client)
  } finally {
    await client.end()
  }
}
