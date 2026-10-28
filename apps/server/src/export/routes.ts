import { Hono } from 'hono'
import { strToU8, zipSync, type Zippable } from 'fflate'
import { requireUser, type AppEnv } from '../http.ts'

const FOLDERS = { day: 'days', week: 'weeks', template: 'templates' } as const

/** `GET /api/export`: every page and template as a markdown file in a zip, for backups and leaving. */
export function exportRoutes() {
  const routes = new Hono<AppEnv>()

  routes.get('/export', async (c) => {
    const user = requireUser(c)
    const notes = await c
      .get('db')
      .selectFrom('notes')
      .select(['kind', 'key', 'content', 'updated_at'])
      .where('user_id', '=', user.id)
      .where('deleted_at', 'is', null)
      .orderBy('kind')
      .orderBy('key')
      .execute()

    const files: Zippable = {}
    for (const note of notes) {
      const folder = FOLDERS[note.kind]
      files[`${folder}/${note.key}.md`] = [
        strToU8(note.content),
        { mtime: new Date(note.updated_at) },
      ]
    }

    const date = c.get('now')().toISOString().slice(0, 10)
    return c.body(zipSync(files), 200, {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="agendina-export-${date}.zip"`,
    })
  })

  return routes
}
