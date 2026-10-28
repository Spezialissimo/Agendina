import { randomUUID } from 'node:crypto'
import { merge3, type DayKey, type MergeChunk } from '@agendina/core'
import type { Note, NoteChange, NoteKind } from '@agendina/contract'
import type { Database, NotesTable } from '@agendina/db'
import type { Selectable, Transaction } from 'kysely'
import type { DB } from '@agendina/db'
import { ApiError } from '../http.ts'

type NoteRow = Selectable<NotesTable>
/** What a row stores: a page, or the template (keyed by the kind of page it is for). */
type StoredKind = NotesTable['kind']

export type SaveResult =
  | { status: 'saved'; note: Note; merged: boolean }
  | { status: 'conflict'; current: Note; chunks: MergeChunk[] }

/** Rolls the transaction back while still returning a result (nothing needed writing). */
class NoWrite extends Error {
  constructor(readonly result: SaveResult) {
    super('no write')
  }
}

export async function getNote(
  db: Database,
  userId: string,
  kind: NoteKind,
  key: string,
): Promise<Note | undefined> {
  const row = await findRow(db, userId, kind, key)
  return row === undefined ? undefined : toNote(row)
}

export async function listNotes(
  db: Database,
  userId: string,
  kind: NoteKind,
  from: DayKey,
  to: DayKey,
): Promise<Note[]> {
  const rows = await db
    .selectFrom('notes')
    .selectAll()
    .where('user_id', '=', userId)
    .where('kind', '=', kind)
    .where('key', '>=', from)
    .where('key', '<=', to)
    .where('deleted_at', 'is', null)
    .orderBy('key')
    .execute()
  return rows.map(toNote)
}

/**
 * Saves `content` written on top of `baseRevision`. If the note changed since, the edit is merged
 * with a three-way merge, or reported as a conflict without saving anything.
 *
 * Each save runs in one transaction that first takes the user's change counter: on Postgres that
 * row lock queues concurrent saves of the same user, and SQLite runs transactions one at a time,
 * so every save reads the latest revision and none is lost.
 */
export async function saveNote(
  db: Database,
  userId: string,
  kind: StoredKind,
  key: string,
  content: string,
  baseRevision: number,
  now: Date,
  /** For pages: the template revision the text is now based on (see SaveNoteRequest). */
  templateRevision?: number,
): Promise<SaveResult> {
  try {
    return await db.transaction().execute(async (trx) => {
      const changeSeq = await nextChangeSeq(trx, userId)
      const current = await findRow(trx, userId, kind, key, { includeDeleted: true })
      const template =
        templateRevision === undefined
          ? undefined
          : await templateOf(trx, userId, kind, templateRevision)

      if (current === undefined) {
        if (baseRevision !== 0) throw new ApiError(400, 'invalid_base_revision')
        const row: NoteRow = {
          id: randomUUID(),
          user_id: userId,
          kind,
          key,
          content,
          revision: 1,
          template_id: template?.id ?? null,
          template_revision: templateRevision ?? null,
          change_seq: changeSeq,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          deleted_at: null,
        }
        await trx.insertInto('notes').values(row).execute()
        await addRevision(trx, row.id, 1, content, now)
        return { status: 'saved', note: toNote(row), merged: false }
      }

      if (baseRevision > current.revision) throw new ApiError(400, 'invalid_base_revision')

      let merged = false
      let next = content
      if (baseRevision < current.revision) {
        const result = merge3(
          await revisionContent(trx, current.id, baseRevision),
          content,
          current.content,
        )
        if (result.status === 'conflict') {
          throw new NoWrite({ status: 'conflict', current: toNote(current), chunks: result.chunks })
        }
        next = result.text
        merged = true
      }
      const templated =
        template === undefined
          ? {}
          : { template_id: template.id, template_revision: templateRevision ?? null }
      const sameTemplate =
        templateRevision === undefined || templateRevision === current.template_revision
      if (next === current.content && sameTemplate) {
        throw new NoWrite({ status: 'saved', note: toNote(current), merged })
      }

      const revision = current.revision + 1
      const updatedAt = now.toISOString()
      await trx
        .updateTable('notes')
        .set({
          content: next,
          revision,
          change_seq: changeSeq,
          updated_at: updatedAt,
          deleted_at: null,
          ...templated,
        })
        .where('id', '=', current.id)
        .execute()
      await addRevision(trx, current.id, revision, next, now)
      const row: NoteRow = {
        ...current,
        content: next,
        revision,
        change_seq: changeSeq,
        updated_at: updatedAt,
        deleted_at: null,
        ...templated,
      }
      return { status: 'saved', note: toNote(row), merged }
    })
  } catch (error) {
    if (error instanceof NoWrite) return error.result
    throw error
  }
}

/**
 * Deletes a note: its text and history are removed, and a tombstone revision remains so the
 * deletion syncs. Refuses if the note changed since `baseRevision`.
 */
export async function deleteNote(
  db: Database,
  userId: string,
  kind: NoteKind,
  key: string,
  baseRevision: number,
  now: Date,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const changeSeq = await nextChangeSeq(trx, userId)
    const current = await findRow(trx, userId, kind, key)
    if (current === undefined) throw new ApiError(404, 'not_found')
    if (baseRevision !== current.revision) throw new ApiError(409, 'stale_revision')

    const revision = current.revision + 1
    await trx
      .updateTable('notes')
      .set({
        content: '',
        revision,
        change_seq: changeSeq,
        updated_at: now.toISOString(),
        deleted_at: now.toISOString(),
      })
      .where('id', '=', current.id)
      .execute()
    await trx.deleteFrom('note_revisions').where('note_id', '=', current.id).execute()
    await addRevision(trx, current.id, revision, '', now)
  })
}

/** The latest state of every note changed after `since`, in change order. */
export async function listChanges(
  db: Database,
  userId: string,
  since: number,
  limit: number,
): Promise<{ changes: NoteChange[]; cursor: number; hasMore: boolean }> {
  const rows = await db
    .selectFrom('notes')
    .selectAll()
    .where('user_id', '=', userId)
    .where('change_seq', '>', since)
    .orderBy('change_seq')
    .limit(limit + 1)
    .execute()
  const page = rows.slice(0, limit)
  return {
    changes: page.map((row) => ({
      ...toNote(row),
      kind: row.kind,
      deleted: row.deleted_at !== null,
    })),
    cursor: page.at(-1)?.change_seq ?? since,
    hasMore: rows.length > limit,
  }
}

export function findRow(
  db: Database | Transaction<DB>,
  userId: string,
  kind: StoredKind,
  key: string,
  { includeDeleted = false } = {},
): Promise<NoteRow | undefined> {
  return db
    .selectFrom('notes')
    .selectAll()
    .where('user_id', '=', userId)
    .where('kind', '=', kind)
    .where('key', '=', key)
    .$if(!includeDeleted, (qb) => qb.where('deleted_at', 'is', null))
    .executeTakeFirst()
}

async function revisionContent(
  db: Database | Transaction<DB>,
  noteId: string,
  revision: number,
): Promise<string> {
  if (revision === 0) return ''
  const row = await db
    .selectFrom('note_revisions')
    .select('content')
    .where('note_id', '=', noteId)
    .where('revision', '=', revision)
    .executeTakeFirst()
  // Deleting a note removes its history: an edit based on a revision from before the deletion
  // merges against an empty page, so the edit wins over the deletion.
  return row?.content ?? ''
}

/** The template for `kind` pages, if it has reached `revision`. */
async function templateOf(
  trx: Transaction<DB>,
  userId: string,
  kind: StoredKind,
  revision: number,
): Promise<NoteRow> {
  const template = kind === 'template' ? undefined : await findRow(trx, userId, 'template', kind)
  if (template === undefined || revision > template.revision) {
    throw new ApiError(400, 'invalid_template_revision')
  }
  return template
}

/** Hands out the user's next change sequence number; the row lock orders concurrent saves. */
async function nextChangeSeq(trx: Transaction<DB>, userId: string): Promise<number> {
  const row = await trx
    .updateTable('users')
    .set((eb) => ({ change_seq: eb('change_seq', '+', 1) }))
    .where('id', '=', userId)
    .returning('change_seq')
    .executeTakeFirstOrThrow()
  return row.change_seq
}

async function addRevision(
  trx: Transaction<DB>,
  noteId: string,
  revision: number,
  content: string,
  now: Date,
) {
  await trx
    .insertInto('note_revisions')
    .values({ note_id: noteId, revision, content, created_at: now.toISOString() })
    .execute()
}

export function toNote(row: NoteRow): Note {
  return {
    kind: row.kind as NoteKind,
    key: row.key,
    content: row.content,
    revision: row.revision,
    templateId: row.template_id,
    templateRevision: row.template_revision,
    updatedAt: row.updated_at,
  }
}
