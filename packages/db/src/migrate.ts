import type { Kysely } from 'kysely'
import { Migrator, type Migration } from 'kysely/migration'
import * as initial from './migrations/0001-initial.ts'
import type { DB } from './schema.ts'

// Migrations are listed in code (not read from a folder) so they survive bundling.
// Never edit a released migration: add a new one.
const MIGRATIONS: Record<string, Migration> = {
  '0001-initial': initial,
}

export async function migrateToLatest(db: Kysely<DB>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: () => Promise.resolve(MIGRATIONS) },
  })
  const { error } = await migrator.migrateToLatest()
  if (error !== undefined) {
    throw error instanceof Error ? error : new Error(`Migration failed: ${JSON.stringify(error)}`)
  }
}
