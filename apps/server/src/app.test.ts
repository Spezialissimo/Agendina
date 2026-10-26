import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HealthResponse } from '@agendina/contract'
import { createDatabase } from '@agendina/db'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'

// These endpoints never touch the database, so an empty one is enough.
const { db } = createDatabase('sqlite::memory:')

describe('GET /api/health', () => {
  it('reports ok with the running version', async () => {
    const app = createApp({ version: '1.2.3', db })

    const res = await app.request('/api/health')

    expect(res.status).toBe(200)
    expect(HealthResponse.parse(await res.json())).toEqual({ status: 'ok', version: '1.2.3' })
  })
})

describe('unknown API routes', () => {
  it('return a JSON 404 instead of the web app', async () => {
    const app = createApp({ version: '1.2.3', db, webDir: makeWebDir() })

    const res = await app.request('/api/does-not-exist')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })
})

describe('serving the web app', () => {
  it('serves built static assets', async () => {
    const app = createApp({ version: '1.2.3', db, webDir: makeWebDir() })

    const res = await app.request('/assets/app.js')

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('console.log("app")')
  })

  it('falls back to index.html for client-side routes', async () => {
    const app = createApp({ version: '1.2.3', db, webDir: makeWebDir() })

    const res = await app.request('/week/2026-W43')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('<div id="root">')
  })

  it('never serves files outside the web directory', async () => {
    const webDir = makeWebDir()
    writeFileSync(join(webDir, '..', 'agendina-secret.txt'), 'secret')
    const app = createApp({ version: '1.2.3', db, webDir })

    const res = await app.request('/..%2Fagendina-secret.txt')

    expect(await res.text()).not.toContain('secret')
  })

  it('is disabled when no web directory is configured', async () => {
    const app = createApp({ version: '1.2.3', db })

    const res = await app.request('/')

    expect(res.status).toBe(404)
  })
})

function makeWebDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agendina-web-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root"></div>')
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("app")')
  return dir
}
