import { compareDays } from '@agendina/core'
import {
  NoteKey,
  NoteKind,
  NotesQuery,
  SaveNoteRequest,
  type NoteConflict,
  type NoteResponse,
  type NotesResponse,
  type SaveNoteResponse,
} from '@agendina/contract'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { ApiError, readJson, requireUser, type AppEnv } from '../http.ts'
import { getNote, listNotes, saveNote } from './repository.ts'

/** The week strip and a year view are the largest ranges the app needs. */
const MAX_RANGE_DAYS = 366

const NotePath = z.object({ kind: NoteKind, key: NoteKey })

export function notesRoutes() {
  const routes = new Hono<AppEnv>()

  routes.get('/notes', async (c) => {
    const user = requireUser(c)
    const query = parse(NotesQuery, c.req.query())
    const span = compareDays(query.to, query.from)
    if (span < 0 || span > MAX_RANGE_DAYS)
      throw new ApiError(400, 'invalid_request', 'Invalid range')
    const notes = await listNotes(c.get('db'), user.id, query.kind, query.from, query.to)
    return c.json({ notes } satisfies NotesResponse)
  })

  routes.get('/notes/:kind/:key', async (c) => {
    const user = requireUser(c)
    const { kind, key } = notePath(c)
    const note = await getNote(c.get('db'), user.id, kind, key)
    if (note === undefined) throw new ApiError(404, 'not_found')
    return c.json({ note } satisfies NoteResponse)
  })

  routes.put('/notes/:kind/:key', async (c) => {
    const user = requireUser(c)
    const { kind, key } = notePath(c)
    const { content, baseRevision } = await readJson(c, SaveNoteRequest)
    const result = await saveNote(
      c.get('db'),
      user.id,
      kind,
      key,
      content,
      baseRevision,
      c.get('now')(),
    )
    if (result.status === 'conflict') {
      return c.json(
        {
          error: 'conflict',
          current: result.current,
          chunks: result.chunks,
        } satisfies NoteConflict,
        409,
      )
    }
    return c.json({ note: result.note, merged: result.merged } satisfies SaveNoteResponse)
  })

  return routes
}

function notePath(c: Context<AppEnv>) {
  return parse(NotePath, c.req.param())
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiError(400, 'invalid_request', result.error.issues)
  return result.data
}
