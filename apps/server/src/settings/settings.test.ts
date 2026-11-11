import { DEFAULT_SETTINGS, MeResponse, SettingsResponse } from '@agendina/contract'
import {
  DEFAULT_LAYOUTS,
  MAX_CUSTOM_LAYOUTS,
  OPEN_PLANNER,
  OPEN_PLANNER_ID,
  US_WEEK,
  activeLayout,
  adoptLegacyLayout,
  allLayouts,
  setSplitSizes,
  type Layout,
  type Layouts,
} from '@agendina/core'
import { testDatabases } from '@agendina/db/testing'
import { describe, expect, it } from 'vitest'
import { FEATURES } from '../entitlements.ts'
import { PASSWORD, sessionCookie, useSignedInServer } from '../testing.ts'

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
      // Left out of the request: Open planner, with the sizes of the layout sent.
      layouts: adoptLegacyLayout(DEFAULT_LAYOUTS, layout),
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
    [
      'a layout without a page to write in',
      {
        ...DEFAULT_SETTINGS,
        layout: { type: 'panel', id: 'p', panel: { type: 'note', kind: 'day', offset: -1 } },
      },
    ],
    [
      'a layout with two editors for the same page',
      {
        ...DEFAULT_SETTINGS,
        layout: {
          ...layout,
          children: layout.children.map((c) => ({
            ...c,
            node: { ...c.node, panel: { type: 'note', kind: 'day', offset: 0 } },
          })),
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

  describe('named layouts', () => {
    const dayOnly: Layout = {
      type: 'panel',
      id: 'd',
      panel: { type: 'note', kind: 'day', offset: 0 },
    }
    const layouts: Layouts = {
      custom: [
        { id: 'custom-1', name: 'Mornings', layout: dayOnly },
        { id: 'custom-2', name: 'Custom layout 2', layout },
      ],
      presetSizes: { [OPEN_PLANNER_ID]: { pages: [0.6, 0.4] } },
      active: { desktop: 'custom-2', phone: 'custom-1' },
    }
    const names = (saved: Layouts) => allLayouts(saved).map((l) => l.name)

    it('saves several layouts and the active one per screen', async () => {
      expect((await putSettings({ ...DEFAULT_SETTINGS, layouts })).status).toBe(200)

      const saved = await getSettings()
      expect(saved.layouts).toEqual(layouts)
      // What the previous release reads while a deploy rolls out (ADR 0012).
      expect(saved.layout).toEqual(layout)
    })

    it('shows the same active layout to every device', async () => {
      await putSettings({ ...DEFAULT_SETTINGS, layouts })
      const login = await t.server.request('/api/auth/login', {
        method: 'POST',
        body: { email: 'admin@example.com', password: PASSWORD },
      })
      const device = sessionCookie(login)

      expect(activeLayout((await getSettings(device)).layouts, 'desktop').name).toBe(
        'Custom layout 2',
      )
    })

    it('reads a layout stored before named layouts existed as a custom layout', async () => {
      await putSettings(DEFAULT_SETTINGS)
      await t.handle.db
        .updateTable('user_settings')
        .set({
          value: JSON.stringify({ ...DEFAULT_SETTINGS, layouts: undefined, layout: dayOnly }),
        })
        .execute()

      const saved = await getSettings()
      expect(names(saved.layouts)).toEqual(['Open planner', 'Custom layout 1'])
      expect(activeLayout(saved.layouts, 'desktop').layout).toEqual(dayOnly)
      expect(saved.layout).toEqual(dayOnly)
    })

    // A tab opened before the deploy keeps running the previous release and saving its settings.
    describe('saved by the previous release, without named layouts', () => {
      const legacy = (single: Layout) => {
        // As JSON drops it: the previous release sends no `layouts`.
        return { ...DEFAULT_SETTINGS, layout: single, layouts: undefined }
      }
      const twoDays: Layout = {
        type: 'split',
        id: 'days',
        direction: 'column',
        children: [
          { size: 0.5, node: dayOnly },
          {
            size: 0.5,
            node: { type: 'panel', id: 'd1', panel: { type: 'note', kind: 'day', offset: 1 } },
          },
        ],
      }

      it('keeps the named layouts and resizes the active one', async () => {
        await putSettings({ ...DEFAULT_SETTINGS, layouts })
        const resized = setSplitSizes(layout, 'pages', [0.5, 0.5])

        expect((await putSettings(legacy(resized))).status).toBe(200)

        const saved = await getSettings()
        expect(names(saved.layouts)).toEqual(names(layouts))
        expect(activeLayout(saved.layouts, 'desktop')).toMatchObject({
          id: 'custom-2',
          layout: resized,
        })
        expect(activeLayout(saved.layouts, 'phone').id).toBe('custom-1')
      })

      it('adds an edited Open planner as a new custom layout', async () => {
        await putSettings({
          ...DEFAULT_SETTINGS,
          layouts: { ...layouts, active: { ...layouts.active, desktop: OPEN_PLANNER_ID } },
        })

        await putSettings(legacy(twoDays))

        const saved = await getSettings()
        expect(names(saved.layouts)).toEqual([...names(layouts), 'Custom layout 3'])
        expect(saved.layout).toEqual(twoDays)
      })

      // E.g. the tab still shows Evenings, but another tab has switched to Mornings since.
      it('resizes the layout it shows, leaving the active one as it is', async () => {
        await putSettings({
          ...DEFAULT_SETTINGS,
          layouts: {
            ...DEFAULT_LAYOUTS,
            custom: [
              { id: 'custom-1', name: 'Mornings', layout: dayOnly },
              { id: 'custom-2', name: 'Evenings', layout: twoDays },
            ],
            active: { desktop: 'custom-1', phone: 'custom-1' },
          },
        })
        const resized = setSplitSizes(twoDays, 'days', [0.7, 0.3])

        await putSettings({ ...legacy(resized), weekRule: US_WEEK })

        const saved = await getSettings()
        expect(saved.weekRule).toEqual(US_WEEK)
        expect(allLayouts(saved.layouts).map((l) => [l.name, l.layout])).toEqual([
          ['Open planner', OPEN_PLANNER],
          ['Mornings', dayOnly],
          ['Evenings', resized],
        ])
        expect(activeLayout(saved.layouts, 'desktop').name).toBe('Mornings')
      })

      it('keeps every layout when there is no room for the one it sends', async () => {
        const full: Layouts = {
          ...DEFAULT_LAYOUTS,
          custom: Array.from({ length: MAX_CUSTOM_LAYOUTS }, (_, i) => ({
            id: `custom-${String(i + 1)}`,
            name: `Custom layout ${String(i + 1)}`,
            layout: dayOnly,
          })),
          active: { desktop: 'custom-1', phone: OPEN_PLANNER_ID },
        }
        await putSettings({ ...DEFAULT_SETTINGS, layouts: full })

        const res = await putSettings({ ...legacy(twoDays), weekRule: US_WEEK })

        expect(res.status).toBe(200)
        const saved = await getSettings()
        expect(saved.layouts).toEqual(full)
        expect(saved.weekRule).toEqual(US_WEEK)
      })

      it('starts from the defaults when nothing was stored', async () => {
        await putSettings(legacy(setSplitSizes(OPEN_PLANNER, 'pages', [0.3, 0.7])))

        expect((await getSettings()).layouts).toEqual({
          ...DEFAULT_LAYOUTS,
          presetSizes: { [OPEN_PLANNER_ID]: { pages: [0.3, 0.7] } },
        })
      })
    })

    it.each<[string, Layouts]>([
      [
        'an active layout that does not exist',
        { ...layouts, active: { desktop: 'custom-9', phone: 'custom-1' } },
      ],
      ['a blank name', { ...layouts, custom: [{ id: 'custom-1', name: '', layout: dayOnly }] }],
    ])('rejects %s and keeps the previous layouts', async (_, invalid) => {
      await putSettings({ ...DEFAULT_SETTINGS, layouts })

      const res = await putSettings({ ...DEFAULT_SETTINGS, layouts: invalid })

      expect(res.status).toBe(400)
      expect((await getSettings()).layouts).toEqual(layouts)
    })
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
