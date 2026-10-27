import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Kysely, PostgresDialect, SqliteDialect } from 'kysely'
import pg from 'pg'
import type { DB } from './schema.ts'
import { adaptNodeSqlite } from './sqlite-adapter.ts'

export type Database = Kysely<DB>

export interface DatabaseHandle {
  db: Database
  kind: 'sqlite' | 'postgres'
  close(): Promise<void>
}

export interface DatabaseOptions {
  /**
   * Called when Postgres drops an idle pooled connection (server restart, failover, admin
   * action). The pool replaces it; without a handler, Node would crash on the unhandled error.
   */
  onConnectionError?: (error: Error) => void
}

/**
 * Opens a database from a URL: `sqlite::memory:`, `sqlite:<path>` or `postgres://…`.
 */
export function createDatabase(
  url: string,
  {
    onConnectionError = (error) => {
      console.error('Postgres connection error:', error.message)
    },
  }: DatabaseOptions = {},
): DatabaseHandle {
  if (url.startsWith('sqlite:')) {
    const path = url.slice('sqlite:'.length)
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    const sqlite = new DatabaseSync(path)
    // node:sqlite enables foreign keys by default; the pragma keeps that explicit.
    sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    const db = new Kysely<DB>({ dialect: new SqliteDialect({ database: adaptNodeSqlite(sqlite) }) })
    return { db, kind: 'sqlite', close: () => db.destroy() }
  }
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const pool = new pg.Pool({ connectionString: url })
    pool.on('error', onConnectionError)
    const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) })
    return { db, kind: 'postgres', close: () => db.destroy() }
  }
  throw new Error(
    `Unsupported database URL ${JSON.stringify(redact(url))}: use sqlite:<path> or postgres://…`,
  )
}

function redact(url: string): string {
  return url.replace(/\/\/[^@/]*@/, '//***@')
}
