import type { Kysely } from 'kysely'

/**
 * The first page a template revision applies to (ADR 0008). Null for revisions saved before it,
 * and for page revisions: they apply from the start.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('note_revisions').addColumn('applies_from', 'text').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('note_revisions').dropColumn('applies_from').execute()
}
