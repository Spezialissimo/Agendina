import type { ColumnType, Generated } from 'kysely'

/**
 * Table types, shared by SQLite and Postgres. Kept portable on purpose: ids are text UUIDs,
 * timestamps are ISO-8601 strings (they sort correctly as text), flags and JSON are text.
 */
export interface DB {
  users: UsersTable
  sessions: SessionsTable
  instance_settings: InstanceSettingsTable
  notes: NotesTable
  note_revisions: NoteRevisionsTable
  user_settings: UserSettingsTable
}

interface UsersTable {
  id: string
  /** Stored lowercased. */
  email: string
  password_hash: string
  role: 'admin' | 'member'
  /** Last change sequence number handed out for this user's notes (the sync cursor). */
  change_seq: Generated<number>
  created_at: string
}

interface SessionsTable {
  /** SHA-256 of the session token; the token itself is only ever in the cookie. */
  id: string
  user_id: string
  created_at: string
  expires_at: string
}

interface InstanceSettingsTable {
  key: string
  /** JSON. */
  value: string
}

export interface NotesTable {
  id: string
  user_id: string
  kind: 'day' | 'week' | 'template'
  /** A DayKey (the day, or the first day of the week) or a template name. */
  key: string
  content: string
  revision: number
  template_id: string | null
  template_revision: number | null
  change_seq: number
  created_at: string
  updated_at: string
  /** Set when the note is deleted (a tombstone, so the deletion syncs). */
  deleted_at: ColumnType<string | null, string | null | undefined, string | null>
}

interface NoteRevisionsTable {
  note_id: string
  revision: number
  content: string
  created_at: string
}

interface UserSettingsTable {
  user_id: string
  /** JSON. */
  value: string
  updated_at: string
}
