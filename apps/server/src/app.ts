import { readFile } from 'node:fs/promises'
import { join, normalize, relative, sep } from 'node:path'
import type { ApiErrorBody, HealthResponse } from '@agendina/contract'
import type { Database } from '@agendina/db'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { authRoutes, loadSession } from './auth/routes.ts'
import { everythingEnabled, type EntitlementPolicy } from './entitlements.ts'
import { exportRoutes } from './export/routes.ts'
import { ApiError, type AppEnv } from './http.ts'
import { notesRoutes } from './notes/routes.ts'
import { settingsRoutes } from './settings/routes.ts'
import { templatesRoutes } from './templates/routes.ts'

export interface AppOptions {
  version: string
  db: Database
  /** Directory with the built web app. When omitted, only the API is served. */
  webDir?: string | undefined
  /** The clock; injectable for tests. */
  now?: () => Date
  /** Which features each user may use; everything by default (self-hosting). */
  entitlements?: EntitlementPolicy
}

export function createApp({
  version,
  db,
  webDir,
  now = () => new Date(),
  entitlements = everythingEnabled,
}: AppOptions) {
  const app = new Hono()

  const api = new Hono<AppEnv>()
  api.use(csrf())
  // Notes are capped at 1 MB of text; refuse anything far larger before reading it.
  api.use(
    bodyLimit({
      maxSize: 4 * 1024 * 1024,
      onError: (c) => c.json({ error: 'payload_too_large' } satisfies ApiErrorBody, 413),
    }),
  )
  api.use(async (c, next) => {
    c.set('db', db)
    c.set('now', now)
    c.set('entitlements', entitlements)
    await next()
  })
  api.use(loadSession)
  api.get('/health', (c) => c.json({ status: 'ok', version } satisfies HealthResponse))
  api.route('/', authRoutes(now))
  api.route('/', notesRoutes())
  api.route('/', settingsRoutes())
  api.route('/', templatesRoutes())
  api.route('/', exportRoutes())
  api.all('*', (c) => c.json({ error: 'not_found' } satisfies ApiErrorBody, 404))
  api.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: error.code } satisfies ApiErrorBody, error.status)
    }
    if (error instanceof HTTPException) {
      // Raised by Hono middleware, e.g. the CSRF origin check (403).
      const code = error.status === 403 ? 'forbidden' : 'http_error'
      return c.json({ error: code } satisfies ApiErrorBody, error.status)
    }
    console.error(error)
    return c.json({ error: 'internal_error' } satisfies ApiErrorBody, 500)
  })
  app.route('/api', api)

  if (webDir !== undefined) {
    app.get('*', async (c) => {
      const asset = await readWebFile(webDir, c.req.path)
      if (asset !== undefined) {
        return c.body(new Uint8Array(asset), 200, { 'content-type': contentType(c.req.path) })
      }
      const index = await readWebFile(webDir, '/index.html')
      return index === undefined ? c.notFound() : c.html(index.toString('utf8'))
    })
  }

  return app
}

async function readWebFile(webDir: string, urlPath: string): Promise<Buffer | undefined> {
  const filePath = normalize(join(webDir, decodeURIComponent(urlPath)))
  const rel = relative(webDir, filePath)
  if (rel === '' || rel.startsWith('..') || rel.startsWith(sep)) return undefined
  try {
    return await readFile(filePath)
  } catch {
    return undefined
  }
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function contentType(path: string): string {
  const ext = path.slice(path.lastIndexOf('.'))
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}
