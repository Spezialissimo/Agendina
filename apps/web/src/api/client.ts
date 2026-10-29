import {
  AuthState,
  InstanceSettings,
  NoteConflict,
  NoteResponse,
  NotesResponse,
  SaveNoteResponse,
  SaveTemplateResponse,
  SettingsResponse,
  TemplateConflict,
  TemplateResponse,
  TemplateRevisionResponse,
  UserResponse,
  type Credentials,
  type Note,
  type NoteKind,
  type Template,
  type UserSettings,
} from '@agendina/contract'
import type { DayKey, MergeChunk } from '@agendina/core'
import type { z } from 'zod'

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The server's error code, e.g. `invalid_credentials`. */
    readonly code: string,
  ) {
    super(`API request failed: ${status} ${code}`)
    this.name = 'ApiError'
  }
}

type SaveResult =
  | { status: 'saved'; note: Note; merged: boolean }
  | { status: 'conflict'; current: Note; chunks: MergeChunk[] }

type SaveTemplateResult =
  | { status: 'saved'; template: Template; merged: boolean }
  | { status: 'conflict'; current: Template; chunks: MergeChunk[] }

/** Typed access to the Agendina API. Every response is validated against the shared contract. */
export class Api {
  constructor(private readonly fetchFn: FetchFn = (input, init) => fetch(input, init)) {}

  authState() {
    return this.call('GET', '/api/auth/state', AuthState)
  }

  signup(credentials: Credentials) {
    return this.call('POST', '/api/auth/signup', UserResponse, credentials)
  }

  login(credentials: Credentials) {
    return this.call('POST', '/api/auth/login', UserResponse, credentials)
  }

  async logout(): Promise<void> {
    await this.send('POST', '/api/auth/logout')
  }

  setInstanceSettings(settings: InstanceSettings) {
    return this.call('PUT', '/api/admin/settings', InstanceSettings, settings)
  }

  /** The note, or null if nobody wrote that page yet. */
  async getNote(kind: NoteKind, key: string): Promise<Note | null> {
    const res = await this.fetchFn(`/api/notes/${kind}/${key}`)
    if (res.status === 404) return null
    return (await this.parse(res, NoteResponse)).note
  }

  async listNotes(kind: NoteKind, from: DayKey, to: DayKey): Promise<Note[]> {
    const query = new URLSearchParams({ kind, from, to })
    return (await this.call('GET', `/api/notes?${query.toString()}`, NotesResponse)).notes
  }

  /**
   * Saves on top of `baseRevision`; a conflict is a normal result, not an error. `keepalive` lets
   * the request finish even if the page is being closed. `templateRevision` records the template
   * revision the page is based on.
   */
  async saveNote(
    kind: NoteKind,
    key: string,
    content: string,
    baseRevision: number,
    {
      keepalive = false,
      templateRevision,
    }: { keepalive?: boolean; templateRevision?: number | undefined } = {},
  ): Promise<SaveResult> {
    const res = await this.send(
      'PUT',
      `/api/notes/${kind}/${key}`,
      { content, baseRevision, ...(templateRevision === undefined ? {} : { templateRevision }) },
      [409],
      keepalive,
    )
    if (res.status === 409) {
      const { current, chunks } = NoteConflict.parse(await res.json())
      return { status: 'conflict', current, chunks }
    }
    const { note, merged } = await this.parse(res, SaveNoteResponse)
    return { status: 'saved', note, merged }
  }

  /** The template for `kind` pages, or null if the user has not written one. */
  async template(kind: NoteKind): Promise<Template | null> {
    return (await this.call('GET', `/api/templates/${kind}`, TemplateResponse)).template
  }

  /** Saves the template on top of `baseRevision`, like `saveNote`. */
  async saveTemplate(
    kind: NoteKind,
    content: string,
    baseRevision: number,
  ): Promise<SaveTemplateResult> {
    const res = await this.send('PUT', `/api/templates/${kind}`, { content, baseRevision }, [409])
    if (res.status === 409) {
      const { current, chunks } = TemplateConflict.parse(await res.json())
      return { status: 'conflict', current, chunks }
    }
    const { template, merged } = await this.parse(res, SaveTemplateResponse)
    return { status: 'saved', template, merged }
  }

  async templateRevision(kind: NoteKind, revision: number): Promise<string> {
    const path = `/api/templates/${kind}/revisions/${String(revision)}`
    return (await this.call('GET', path, TemplateRevisionResponse)).content
  }

  /** The pages made from the template, from `from` onwards. */
  async templatedPages(kind: NoteKind, from: DayKey): Promise<Note[]> {
    const query = new URLSearchParams({ from })
    return (
      await this.call('GET', `/api/templates/${kind}/pages?${query.toString()}`, NotesResponse)
    ).notes
  }

  async settings(): Promise<UserSettings> {
    return (await this.call('GET', '/api/settings', SettingsResponse)).settings
  }

  /** `keepalive` lets the request finish even if the page is being closed. */
  async saveSettings(
    settings: UserSettings,
    { keepalive = false }: { keepalive?: boolean } = {},
  ): Promise<UserSettings> {
    const res = await this.send('PUT', '/api/settings', settings, [], keepalive)
    return (await this.parse(res, SettingsResponse)).settings
  }

  private async call<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    return this.parse(await this.send(method, path, body), schema)
  }

  private async send(
    method: string,
    path: string,
    body?: unknown,
    allowed: number[] = [],
    keepalive = false,
  ): Promise<Response> {
    const res = await this.fetchFn(path, {
      method,
      ...(keepalive ? { keepalive } : {}),
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    })
    if (!res.ok && !allowed.includes(res.status))
      throw new ApiError(res.status, await errorCode(res))
    return res
  }

  private async parse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
    if (!res.ok) throw new ApiError(res.status, await errorCode(res))
    return schema.parse(await res.json())
  }
}

async function errorCode(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json()
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      return body.error
    }
  } catch {
    // Not JSON (e.g. a proxy error page).
  }
  return 'http_error'
}
