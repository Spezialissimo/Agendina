import {
  NoteKind,
  SaveNoteRequest,
  TemplatedPagesQuery,
  type NotesResponse,
  type SaveTemplateResponse,
  type TemplateConflict,
  type TemplateResponse,
  type TemplateRevisionResponse,
} from '@agendina/contract'
import { Hono } from 'hono'
import { z } from 'zod'
import { ApiError, parse, readJson, requireUser, type AppEnv } from '../http.ts'
import { getTemplate, getTemplateRevision, listTemplatedPages, saveTemplate } from './repository.ts'

const TemplatePath = z.object({ kind: NoteKind })
const RevisionPath = TemplatePath.extend({ revision: z.coerce.number().int().positive() })

/** Day and week templates (ADR 0008). Applying them to pages happens on the client. */
export function templatesRoutes() {
  const routes = new Hono<AppEnv>()

  routes.get('/templates/:kind', async (c) => {
    const user = requireUser(c)
    const { kind } = parse(TemplatePath, c.req.param())
    const template = (await getTemplate(c.get('db'), user.id, kind)) ?? null
    return c.json({ template } satisfies TemplateResponse)
  })

  routes.put('/templates/:kind', async (c) => {
    const user = requireUser(c)
    const { kind } = parse(TemplatePath, c.req.param())
    const { content, baseRevision } = await readJson(
      c,
      SaveNoteRequest.omit({ templateRevision: true }),
    )
    const result = await saveTemplate(
      c.get('db'),
      user.id,
      kind,
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
        } satisfies TemplateConflict,
        409,
      )
    }
    return c.json({ template: result.note, merged: result.merged } satisfies SaveTemplateResponse)
  })

  routes.get('/templates/:kind/revisions/:revision', async (c) => {
    const user = requireUser(c)
    const { kind, revision } = parse(RevisionPath, c.req.param())
    const content = await getTemplateRevision(c.get('db'), user.id, kind, revision)
    if (content === undefined) throw new ApiError(404, 'not_found')
    return c.json({ revision, content } satisfies TemplateRevisionResponse)
  })

  routes.get('/templates/:kind/pages', async (c) => {
    const user = requireUser(c)
    const { kind } = parse(TemplatePath, c.req.param())
    const { from } = parse(TemplatedPagesQuery, c.req.query())
    const notes = await listTemplatedPages(c.get('db'), user.id, kind, from)
    return c.json({ notes } satisfies NotesResponse)
  })

  return routes
}
