import { DEFAULT_SETTINGS, UserSettings, type SettingsResponse } from '@agendina/contract'
import type { Database } from '@agendina/db'
import { Hono } from 'hono'
import { readJson, requireUser, type AppEnv } from '../http.ts'

export function settingsRoutes() {
  const routes = new Hono<AppEnv>()

  routes.get('/settings', async (c) => {
    const user = requireUser(c)
    return c.json({ settings: await loadSettings(c.get('db'), user.id) } satisfies SettingsResponse)
  })

  routes.put('/settings', async (c) => {
    const user = requireUser(c)
    const settings = await readJson(c, UserSettings)
    const value = JSON.stringify(settings)
    const updatedAt = c.get('now')().toISOString()
    await c
      .get('db')
      .insertInto('user_settings')
      .values({ user_id: user.id, value, updated_at: updatedAt })
      .onConflict((oc) => oc.column('user_id').doUpdateSet({ value, updated_at: updatedAt }))
      .execute()
    return c.json({ settings } satisfies SettingsResponse)
  })

  return routes
}

/** The user's settings, or the defaults. Stored JSON is validated again, as it may predate changes. */
async function loadSettings(db: Database, userId: string): Promise<UserSettings> {
  const row = await db
    .selectFrom('user_settings')
    .select('value')
    .where('user_id', '=', userId)
    .executeTakeFirst()
  if (row === undefined) return DEFAULT_SETTINGS
  const parsed = UserSettings.safeParse(JSON.parse(row.value))
  if (!parsed.success) {
    console.warn(`Ignoring invalid stored settings for user ${userId}`)
    return DEFAULT_SETTINGS
  }
  return parsed.data
}
