import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import type { SqliteDatabase } from 'kysely'

/** Adapts Node's built-in `node:sqlite` to the better-sqlite3-style interface Kysely expects. */
export function adaptNodeSqlite(database: DatabaseSync): SqliteDatabase {
  return {
    close: () => {
      database.close()
    },
    prepare(sql) {
      const statement = database.prepare(sql)
      const args = (parameters: readonly unknown[]) => parameters.map(toSqlite)
      return {
        reader: statement.columns().length > 0,
        all: (parameters) => statement.all(...args(parameters)),
        run: (parameters) => statement.run(...args(parameters)),
        iterate: (parameters) => statement.iterate(...args(parameters)),
      }
    },
  }
}

function toSqlite(value: unknown): SQLInputValue {
  if (value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  return value as SQLInputValue
}
