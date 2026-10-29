import { DEFAULT_SETTINGS, MeResponse, SettingsResponse } from '@agendina/contract'
import { OPEN_PLANNER, US_WEEK, type Layout } from '@agendina/core'
import { testDatabases } from '@agendina/db/testing'
import { describe, expect, it } from 'vitest'
import { FEATURES } from '../entitlements.ts'
import { useSignedInServer } from '../testing.ts'

const layout: Layout = {
  type: 'split',
  id: 'pages',
  direction: 'row',
  children: [
    {
      size: 0.3,
      node: { type: 'panel', id: 'week', panel: { type: 'note', kind: 'week', offset: 0 } },
    },
    {
      size: 0.7,
      node: { type: 'panel', id: 'day', panel: { type: 'note', kind: 'day', offset: 0 } },
    },
  ],
}

describe.each(testDatabases())('settings on $kind', ({ create }) => {
  const t = useSignedInServer(create)

  const getSettings = async (as = t.cookie) => {
    const res = await t.server.request('/api/settings', { cookie: as })
    expect(res.status).toBe(200)
    return SettingsResponse.parse(await res.json()).settings
  }
  const putSettings = (body: unknown, as = t.cookie) =>
    t.server.request('/api/settings', { method: 'PUT', cookie: as, body })

  it('returns the defaults until the user saves something', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS.layout).toEqual(OPEN_PLANNER)
  })

  it('saves settings, normalizing key bindings', async () => {
    const res = await putSettings({
      weekRule: US_WEEK,
      keymap: { 'focus.nextDay': ['shift+mod+ArrowRight', 'Mod+KeyJ'], 'palette.open': [] },
      layout,
    })

    expect(res.status).toBe(200)
    expect(await getSettings()).toEqual({
      weekRule: US_WEEK,
      keymap: { 'focus.nextDay': ['Mod+Shift+ArrowRight', 'Mod+KeyJ'], 'palette.open': [] },
      layout,
      // Left out of the request: the default.
      focusMode: DEFAULT_SETTINGS.focusMode,
    })
  })

  it('replaces previously saved settings', async () => {
    await putSettings({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })
    await putSettings({ ...DEFAULT_SETTINGS, keymap: { 'palette.open': ['Mod+KeyP'] } })

    expect(await getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      keymap: { 'palette.open': ['Mod+KeyP'] },
    })
  })

  it.each([
    [
      'a week starting on day 8',
      { ...DEFAULT_SETTINGS, weekRule: { firstDay: 8, minimalDays: 4 } },
    ],
    [
      'an invalid key binding',
      { ...DEFAULT_SETTINGS, keymap: { 'palette.open': ['Mod+Hyper+KeyP'] } },
    ],
    [
      'too many bindings for one command',
      { ...DEFAULT_SETTINGS, keymap: { x: Array(6).fill('Mod+KeyP') } },
    ],
    [
      'too many commands',
      {
        ...DEFAULT_SETTINGS,
        keymap: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`c${i}`, []])),
      },
    ],
    [
      'a layout with duplicate ids',
      {
        ...DEFAULT_SETTINGS,
        layout: {
          ...layout,
          children: layout.children.map((c) => ({ ...c, node: { ...c.node, id: 'same' } })),
        },
      },
    ],
    ['a missing field', { weekRule: US_WEEK, keymap: {} }],
  ])('rejects %s and keeps the previous settings', async (_, body) => {
    const res = await putSettings(body)

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_request' })
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('saves focus mode settings', async () => {
    const focusMode = { enabled: false, idleMs: 5000 }
    await putSettings({ ...DEFAULT_SETTINGS, focusMode })

    expect((await getSettings()).focusMode).toEqual(focusMode)
  })

  it('turns focus mode on after 1.5 seconds by default', () => {
    expect(DEFAULT_SETTINGS.focusMode).toEqual({ enabled: true, idleMs: 1500 })
  })

  it.each([0, 499, 60_001, 1.5])('rejects a resting time of %s ms', async (idleMs) => {
    const res = await putSettings({ ...DEFAULT_SETTINGS, focusMode: { enabled: true, idleMs } })

    expect(res.status).toBe(400)
  })

  it('keeps settings saved before focus mode existed, with its defaults', async () => {
    await putSettings({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })
    const older = { weekRule: US_WEEK, keymap: {}, layout: DEFAULT_SETTINGS.layout }
    await t.handle.db
      .updateTable('user_settings')
      .set({ value: JSON.stringify(older) })
      .execute()

    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })
  })

  it('falls back to the defaults when stored settings are no longer valid', async () => {
    await putSettings({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })
    await t.handle.db
      .updateTable('user_settings')
      .set({ value: '{"weekRule":{"firstDay":9}}' })
      .execute()

    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps each user’s settings separate', async () => {
    await t.server.request('/api/admin/settings', {
      method: 'PUT',
      cookie: t.cookie,
      body: { signupOpen: true },
    })
    const other = await t.server.signup('other@example.com')

    await putSettings({ ...DEFAULT_SETTINGS, weekRule: US_WEEK })

    expect(await getSettings(other)).toEqual(DEFAULT_SETTINGS)
  })

  it('requires a signed-in user', async () => {
    expect((await t.server.request('/api/settings')).status).toBe(401)
    expect(
      (await t.server.request('/api/settings', { method: 'PUT', body: DEFAULT_SETTINGS })).status,
    ).toBe(401)
  })

  it('reports every feature as enabled on a self-hosted instance', async () => {
    const me = MeResponse.parse(
      await (await t.server.request('/api/me', { cookie: t.cookie })).json(),
    )

    expect(me.features).toEqual([...FEATURES])
  })
})
