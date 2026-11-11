import type { DayKey } from '@agendina/core'
import type { Note, NoteKind, Template } from '@agendina/contract'
import type { Database, NotesTable } from '@agendina/db'
import type { Selectable } from 'kysely'
import { findRow, saveNote, toNote } from '../notes/repository.ts'

/** A template is stored as a note of kind `template`, keyed by the kind of page it is for. */
export async function getTemplate(
  db: Database,
  userId: string,
  kind: NoteKind,
): Promise<Template | undefined> {
  const row = await findRow(db, userId, 'template', kind)
  return row === undefined ? undefined : toTemplate(row)
}

export async function saveTemplate(
  db: Database,
  userId: string,
  kind: NoteKind,
  content: string,
  baseRevision: number,
  now: Date,
  appliesFrom?: DayKey,
) {
  const result = await saveNote(
    db,
    userId,
    'template',
    kind,
    content,
    baseRevision,
    now,
    undefined,
    appliesFrom,
  )
  if (result.status === 'conflict') {
    return { ...result, current: fromNote(kind, result.current) }
  }
  return { ...result, note: fromNote(kind, result.note) }
}

export async function getTemplateRevision(
  db: Database,
  userId: string,
  kind: NoteKind,
  revision: number,
): Promise<string | undefined> {
  const row = await db
    .selectFrom('note_revisions')
    .innerJoin('notes', 'notes.id', 'note_revisions.note_id')
    .select('note_revisions.content')
    .where('notes.user_id', '=', userId)
    .where('notes.kind', '=', 'template')
    .where('notes.key', '=', kind)
    .where('note_revisions.revision', '=', revision)
    .executeTakeFirst()
  return row?.content
}

/**
 * The revision a `kind` page nobody wrote yet starts from: the latest one applied from `key` or an
 * earlier page (null: from the start). Undefined when none applies to it.
 */
export async function templateForPage(
  db: Database,
  userId: string,
  kind: NoteKind,
  key: DayKey,
): Promise<{ revision: number; content: string } | undefined> {
  const row = await db
    .selectFrom('note_revisions')
    .innerJoin('notes', 'notes.id', 'note_revisions.note_id')
    .select(['note_revisions.revision', 'note_revisions.content'])
    .where('notes.user_id', '=', userId)
    .where('notes.kind', '=', 'template')
    .where('notes.key', '=', kind)
    .where('notes.deleted_at', 'is', null)
    .where((eb) =>
      eb.or([
        eb('note_revisions.applies_from', 'is', null),
        eb('note_revisions.applies_from', '<=', key),
      ]),
    )
    .orderBy('note_revisions.revision', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row
}

/** The pages created from the template, from `from` onwards: the ones a template edit updates. */
export async function listTemplatedPages(
  db: Database,
  userId: string,
  kind: NoteKind,
  from: DayKey,
): Promise<Note[]> {
  const rows = await db
    .selectFrom('notes')
    .selectAll()
    .where('user_id', '=', userId)
    .where('kind', '=', kind)
    .where('key', '>=', from)
    .where('template_revision', 'is not', null)
    .where('deleted_at', 'is', null)
    .orderBy('key')
    .execute()
  return rows.map(toNote)
}

function toTemplate(row: Selectable<NotesTable>): Template {
  return fromNote(row.key as NoteKind, toNote(row))
}

function fromNote(kind: NoteKind, note: Note): Template {
  return { kind, content: note.content, revision: note.revision, updatedAt: note.updatedAt }
}
