import { readFile } from 'node:fs/promises'
import { join, normalize, relative, sep } from 'node:path'
import type { HealthResponse } from '@agendina/contract'
import { Hono } from 'hono'

export interface AppOptions {
  version: string
  /** Directory with the built web app. When omitted, only the API is served. */
  webDir?: string
}

export function createApp({ version, webDir }: AppOptions) {
  const app = new Hono()

  const api = new Hono()
  api.get('/health', (c) => c.json({ status: 'ok', version } satisfies HealthResponse))
  api.all('*', (c) => c.json({ error: 'not_found' }, 404))
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
