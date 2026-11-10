import {
  DEFAULT_LAYOUTS,
  OPEN_PLANNER,
  OPEN_PLANNER_ID,
  activeLayout,
  setSplitSizes,
  type Layout,
  type Layouts,
} from '@agendina/core'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, MAX_CUSTOM_LAYOUTS, SettingsUpdate, UserSettings } from './settings.ts'

const DAY_ONLY: Layout = { type: 'panel', id: 'd', panel: { type: 'note', kind: 'day', offset: 0 } }

const withCustom = (...custom: Layouts['custom']): Layouts => ({
  ...DEFAULT_LAYOUTS,
  custom,
  active: { desktop: custom[0]?.id ?? OPEN_PLANNER_ID, phone: OPEN_PLANNER_ID },
})

const mornings = { id: 'custom-1', name: 'Mornings', layout: DAY_ONLY }

describe('UserSettings', () => {
  it('starts with Open planner as the only layout, active everywhere', () => {
    expect(DEFAULT_SETTINGS.layouts).toEqual(DEFAULT_LAYOUTS)
    expect(DEFAULT_SETTINGS.layout).toEqual(OPEN_PLANNER)
  })

  it('keeps several named layouts and the active one per screen', () => {
    const layouts = withCustom(mornings)
    const settings = UserSettings.parse({ ...DEFAULT_SETTINGS, layout: DAY_ONLY, layouts })

    expect(settings.layouts).toEqual(layouts)
    expect(activeLayout(settings.layouts, 'desktop').name).toBe('Mornings')
  })

  // The previous release reads only `layout` (ADR 0012).
  it('fills the single layout with the active desktop layout, whatever it was sent with', () => {
    const settings = UserSettings.parse({
      ...DEFAULT_SETTINGS,
      layout: OPEN_PLANNER,
      layouts: withCustom(mornings),
    })

    expect(settings.layout).toEqual(DAY_ONLY)
  })

  it('reads settings saved before named layouts existed', () => {
    const resized = setSplitSizes(OPEN_PLANNER, 'pages', [0.3, 0.7])
    const before = { ...DEFAULT_SETTINGS, layout: resized, layouts: undefined }

    const settings = UserSettings.parse(before)

    expect(activeLayout(settings.layouts, 'desktop')).toMatchObject({
      id: OPEN_PLANNER_ID,
      layout: resized,
    })
    expect(settings.layout).toEqual(resized)
  })

  it.each<[string, Layouts]>([
    [
      'an active layout that does not exist',
      { ...DEFAULT_LAYOUTS, active: { desktop: 'custom-9', phone: OPEN_PLANNER_ID } },
    ],
    ['two layouts with the same id', withCustom(mornings, { ...mornings, name: 'Evenings' })],
    ['a custom layout with the id of a preset', withCustom({ ...mornings, id: OPEN_PLANNER_ID })],
    ['a blank name', withCustom({ ...mornings, name: '  ' })],
    ['a name longer than 60 characters', withCustom({ ...mornings, name: 'x'.repeat(61) })],
    [
      'too many custom layouts',
      withCustom(
        ...Array.from({ length: MAX_CUSTOM_LAYOUTS + 1 }, (_, i) => ({
          ...mornings,
          id: `custom-${String(i)}`,
        })),
      ),
    ],
    [
      'a custom layout without a page to write in',
      withCustom({
        ...mornings,
        layout: { type: 'panel', id: 'd', panel: { type: 'note', kind: 'day', offset: 1 } },
      }),
    ],
  ])('rejects %s', (_, layouts) => {
    expect(UserSettings.safeParse({ ...DEFAULT_SETTINGS, layouts }).success).toBe(false)
  })
})

describe('SettingsUpdate', () => {
  // A tab still running the previous release saves settings without named layouts.
  it('accepts settings without named layouts, to merge with the stored ones', () => {
    const before = { ...DEFAULT_SETTINGS, layouts: undefined }

    expect(SettingsUpdate.parse(before).layouts).toBeUndefined()
  })
})
