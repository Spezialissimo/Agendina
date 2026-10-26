import { isDayKey, type MergeChunk } from '@agendina/core'
import { z } from 'zod'

export const NoteKind = z.enum(['day', 'week'])
export type NoteKind = z.infer<typeof NoteKind>

/** A day (`YYYY-MM-DD`); for week notes, the first day of the week. */
export const NoteKey = z.string().refine(isDayKey, 'Expected a day as YYYY-MM-DD')

/** Notes are journal pages; 1 MB of markdown is far beyond any real page. */
export const MAX_NOTE_LENGTH = 1_000_000

export const Note = z.object({
  kind: NoteKind,
  key: z.string(),
  content: z.string(),
  revision: z.number().int().positive(),
  templateId: z.string().nullable(),
  templateRevision: z.number().int().nullable(),
  updatedAt: z.string(),
})
export type Note = z.infer<typeof Note>

export const NoteResponse = z.object({ note: Note })
export type NoteResponse = z.infer<typeof NoteResponse>

export const NotesQuery = z.object({ kind: NoteKind, from: NoteKey, to: NoteKey })
export type NotesQuery = z.infer<typeof NotesQuery>

export const NotesResponse = z.object({ notes: z.array(Note) })
export type NotesResponse = z.infer<typeof NotesResponse>

export const SaveNoteRequest = z.object({
  content: z.string().max(MAX_NOTE_LENGTH),
  /** The revision the edit started from; 0 for a note that did not exist yet. */
  baseRevision: z.number().int().nonnegative(),
})
export type SaveNoteRequest = z.infer<typeof SaveNoteRequest>

export const SaveNoteResponse = z.object({
  note: Note,
  /** True when the edit was combined with changes saved meanwhile (three-way merge). */
  merged: z.boolean(),
})
export type SaveNoteResponse = z.infer<typeof SaveNoteResponse>

const MergeChunkSchema: z.ZodType<MergeChunk> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ok'), lines: z.array(z.string()) }),
  z.object({
    type: z.literal('conflict'),
    base: z.array(z.string()),
    mine: z.array(z.string()),
    theirs: z.array(z.string()),
  }),
])

/** 409 body: the edit overlaps changes saved meanwhile; nothing was saved. */
export const NoteConflict = z.object({
  error: z.literal('conflict'),
  current: Note,
  chunks: z.array(MergeChunkSchema),
})
export type NoteConflict = z.infer<typeof NoteConflict>

export const DeleteNoteQuery = z.object({ baseRevision: z.coerce.number().int().positive() })
export type DeleteNoteQuery = z.infer<typeof DeleteNoteQuery>

/** A note's latest state in the changes feed. Deleted notes have `deleted: true` and no content. */
export const NoteChange = Note.extend({ deleted: z.boolean() })
export type NoteChange = z.infer<typeof NoteChange>

export const ChangesQuery = z.object({
  since: z.coerce.number().int().nonnegative(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
})
export type ChangesQuery = z.infer<typeof ChangesQuery>

export const ChangesResponse = z.object({
  changes: z.array(NoteChange),
  /** Pass as `since` next time. */
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})
export type ChangesResponse = z.infer<typeof ChangesResponse>
