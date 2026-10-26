import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('email', 'text', (c) => c.notNull().unique())
    .addColumn('password_hash', 'text', (c) => c.notNull())
    .addColumn('role', 'text', (c) => c.notNull())
    .addColumn('change_seq', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute()

  await db.schema
    .createTable('sessions')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('user_id', 'text', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('expires_at', 'text', (c) => c.notNull())
    .execute()
  await db.schema.createIndex('sessions_user_id').on('sessions').column('user_id').execute()

  await db.schema
    .createTable('instance_settings')
    .addColumn('key', 'text', (c) => c.primaryKey())
    .addColumn('value', 'text', (c) => c.notNull())
    .execute()

  await db.schema
    .createTable('notes')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('user_id', 'text', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('key', 'text', (c) => c.notNull())
    .addColumn('content', 'text', (c) => c.notNull())
    .addColumn('revision', 'integer', (c) => c.notNull())
    .addColumn('template_id', 'text')
    .addColumn('template_revision', 'integer')
    .addColumn('change_seq', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .addColumn('deleted_at', 'text')
    .addUniqueConstraint('notes_user_kind_key', ['user_id', 'kind', 'key'])
    .execute()
  await db.schema
    .createIndex('notes_user_change_seq')
    .on('notes')
    .columns(['user_id', 'change_seq'])
    .execute()

  await db.schema
    .createTable('note_revisions')
    .addColumn('note_id', 'text', (c) => c.notNull().references('notes.id').onDelete('cascade'))
    .addColumn('revision', 'integer', (c) => c.notNull())
    .addColumn('content', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addPrimaryKeyConstraint('note_revisions_pk', ['note_id', 'revision'])
    .execute()

  await db.schema
    .createTable('user_settings')
    .addColumn('user_id', 'text', (c) => c.primaryKey().references('users.id').onDelete('cascade'))
    .addColumn('value', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    'user_settings',
    'note_revisions',
    'notes',
    'instance_settings',
    'sessions',
    'users',
  ]) {
    await db.schema.dropTable(table).execute()
  }
}
