import { z } from 'zod'
import { MergeChunk, NoteKey, NoteKind, SaveNoteRequest } from './notes.ts'

/** The pre-printed page that new day or week pages start from (ADR 0008). */
export const Template = z.object({
  /** The pages it is for. */
  kind: NoteKind,
  content: z.string(),
  revision: z.number().int().positive(),
  updatedAt: z.string(),
})
export type Template = z.infer<typeof Template>

export const TemplateResponse = z.object({
  /** Null until the user writes a template for this kind of page. */
  template: Template.nullable(),
})
export type TemplateResponse = z.infer<typeof TemplateResponse>

export const SaveTemplateResponse = z.object({ template: Template, merged: z.boolean() })
export type SaveTemplateResponse = z.infer<typeof SaveTemplateResponse>

/** 409 body: the template changed elsewhere on the same lines; nothing was saved. */
export const TemplateConflict = z.object({
  error: z.literal('conflict'),
  current: Template,
  chunks: z.array(MergeChunk),
})
export type TemplateConflict = z.infer<typeof TemplateConflict>

export const TemplateRevisionResponse = z.object({
  revision: z.number().int().positive(),
  content: z.string(),
})
export type TemplateRevisionResponse = z.infer<typeof TemplateRevisionResponse>

export const SaveTemplateRequest = SaveNoteRequest.omit({ templateRevision: true }).extend({
  /**
   * The first page (day, or first day of the week) this revision applies to: a page nobody wrote
   * yet starts from the latest revision applied from it or an earlier page. Without it, from the
   * start.
   */
  appliesFrom: NoteKey.optional(),
})
export type SaveTemplateRequest = z.infer<typeof SaveTemplateRequest>

/** The template revision a page nobody wrote yet starts from; null when none applies to it. */
export const TemplateForPageResponse = z.object({ template: TemplateRevisionResponse.nullable() })
export type TemplateForPageResponse = z.infer<typeof TemplateForPageResponse>

export const TemplatedPagesQuery = z.object({ from: NoteKey })
export type TemplatedPagesQuery = z.infer<typeof TemplatedPagesQuery>
