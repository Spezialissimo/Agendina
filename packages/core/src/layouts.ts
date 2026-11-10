import { OPEN_PLANNER, setSplitSizes, type Layout, type Panel } from './layout.ts'

/**
 * The layouts a user keeps (ADR 0005): the presets, which never change, and their own custom
 * layouts, with the one each type of screen shows. Every operation is a pure function that keeps
 * the active layouts pointing at layouts that exist.
 */

export type Screen = 'desktop' | 'phone'

export interface CustomLayout {
  id: string
  name: string
  layout: Layout
}

export interface Layouts {
  custom: CustomLayout[]
  /** The splitter sizes chosen for a preset: preset id → split id → sizes. */
  presetSizes: Record<string, Record<string, number[]>>
  active: Record<Screen, string>
}

export interface NamedLayout extends CustomLayout {
  preset: boolean
}

export const OPEN_PLANNER_ID = 'open-planner'

export const PRESETS: readonly CustomLayout[] = [
  { id: OPEN_PLANNER_ID, name: 'Open planner', layout: OPEN_PLANNER },
]

export const MAX_LAYOUT_NAME = 60

export const DEFAULT_LAYOUTS: Layouts = {
  custom: [],
  presetSizes: {},
  active: { desktop: OPEN_PLANNER_ID, phone: OPEN_PLANNER_ID },
}

/** Every layout as the list shows it: the presets with their chosen sizes, then custom ones. */
export function allLayouts(layouts: Layouts): NamedLayout[] {
  return [
    ...PRESETS.map((preset) => ({
      ...preset,
      preset: true,
      layout: withSizes(preset.layout, layouts.presetSizes[preset.id] ?? {}),
    })),
    ...layouts.custom.map((custom) => ({ ...custom, preset: false })),
  ]
}

/** The layout `screen` shows; the default one if the chosen one no longer exists. */
export function activeLayout(layouts: Layouts, screen: Screen): NamedLayout {
  const all = allLayouts(layouts)
  return all.find((l) => l.id === layouts.active[screen]) ?? (all[0] as NamedLayout)
}

export function selectLayout(layouts: Layouts, screen: Screen, id: string): Layouts {
  if (!allLayouts(layouts).some((l) => l.id === id)) return layouts
  return { ...layouts, active: { ...layouts.active, [screen]: id } }
}

/** Moves a splitter of layout `id`. Presets keep their arrangement, only the sizes are stored. */
export function resizeLayout(
  layouts: Layouts,
  id: string,
  splitId: string,
  sizes: number[],
): Layouts {
  const preset = allLayouts(layouts).find((l) => l.id === id && l.preset)
  if (preset !== undefined) {
    return {
      ...layouts,
      presetSizes: {
        ...layouts.presetSizes,
        [id]: sizesOf(setSplitSizes(preset.layout, splitId, sizes)),
      },
    }
  }
  return updateCustom(layouts, id, (c) => ({
    ...c,
    layout: setSplitSizes(c.layout, splitId, sizes),
  }))
}

/**
 * Saves what the layout editor made, with the name typed there, and shows it on `screen`. A
 * custom layout is changed in place; a preset ("Duplicate and edit") or a layout made from
 * scratch (`editing: undefined`) becomes a new custom layout. A blank name keeps the name the
 * layout has, or would get.
 */
export function saveEditedLayout(
  layouts: Layouts,
  {
    editing,
    layout,
    screen,
    name = '',
  }: { editing: string | undefined; layout: Layout; screen: Screen; name?: string },
): Layouts {
  const original = layouts.custom.find((c) => c.id === editing)
  const saved =
    original === undefined
      ? addCustom(layouts, layout, screen)
      : selectLayout(
          updateCustom(layouts, original.id, (c) => ({ ...c, layout })),
          screen,
          original.id,
        )
  return renameLayout(saved, saved.active[screen], name)
}

/** The name a new layout gets unless named otherwise: "Custom layout N". */
export function nextLayoutName(layouts: Layouts): string {
  const number = highest(
    layouts.custom.map((c) => c.name),
    /^Custom layout (\d+)$/,
  )
  return `Custom layout ${String(number + 1)}`
}

export function renameLayout(layouts: Layouts, id: string, name: string): Layouts {
  const trimmed = name.trim().slice(0, MAX_LAYOUT_NAME).trim()
  if (trimmed === '') return layouts
  return updateCustom(layouts, id, (c) => ({ ...c, name: trimmed }))
}

/** Deletes a custom layout; the screens that showed it show the default layout instead. */
export function deleteLayout(layouts: Layouts, id: string): Layouts {
  if (!layouts.custom.some((c) => c.id === id)) return layouts
  const fallback = (screen: Screen) =>
    layouts.active[screen] === id ? OPEN_PLANNER_ID : layouts.active[screen]
  return {
    ...layouts,
    custom: layouts.custom.filter((c) => c.id !== id),
    active: { desktop: fallback('desktop'), phone: fallback('phone') },
  }
}

/**
 * Takes in the single desktop layout the previous release saves (ADR 0012): settings stored
 * before named layouts existed, or saved by a tab still running that release. It changes the
 * active desktop layout as little as possible and never loses another layout.
 */
export function adoptLegacyLayout(layouts: Layouts, layout: Layout): Layouts {
  const active = activeLayout(layouts, 'desktop')
  if (sameLayout(active.layout, layout, true)) return layouts
  if (!active.preset) return updateCustom(layouts, active.id, (c) => ({ ...c, layout }))
  const preset = PRESETS.find((p) => sameLayout(p.layout, layout, false))
  if (preset === undefined) return addCustom(layouts, layout, 'desktop')
  return selectLayout(
    { ...layouts, presetSizes: { ...layouts.presetSizes, [preset.id]: sizesOf(layout) } },
    'desktop',
    preset.id,
  )
}

function addCustom(layouts: Layouts, layout: Layout, screen: Screen): Layouts {
  const id = `custom-${String(
    highest(
      layouts.custom.map((c) => c.id),
      /^custom-(\d+)$/,
    ) + 1,
  )}`
  const name = nextLayoutName(layouts)
  return selectLayout({ ...layouts, custom: [...layouts.custom, { id, name, layout }] }, screen, id)
}

/** The highest number `pattern` finds in `values`, or 0. */
function highest(values: string[], pattern: RegExp): number {
  return Math.max(0, ...values.map((v) => Number(pattern.exec(v)?.[1] ?? 0)))
}

function updateCustom(
  layouts: Layouts,
  id: string,
  update: (custom: CustomLayout) => CustomLayout,
): Layouts {
  return { ...layouts, custom: layouts.custom.map((c) => (c.id === id ? update(c) : c)) }
}

function sizesOf(layout: Layout): Record<string, number[]> {
  if (layout.type === 'panel') return {}
  return Object.assign(
    { [layout.id]: layout.children.map((c) => c.size) },
    ...layout.children.map((c) => sizesOf(c.node)),
  ) as Record<string, number[]>
}

/** `layout` with the stored sizes that still fit it. */
function withSizes(layout: Layout, sizes: Record<string, number[]>): Layout {
  return Object.entries(sizes).reduce((result, [splitId, split]) => {
    try {
      return setSplitSizes(result, splitId, split)
    } catch {
      // Stored for a version of the preset that had other splits.
      return result
    }
  }, layout)
}

/** Whether two layouts show the same pages in the same arrangement, and optionally sizes. */
function sameLayout(a: Layout, b: Layout, compareSizes: boolean): boolean {
  if (a.id !== b.id) return false
  if (a.type === 'panel' || b.type === 'panel') {
    return a.type === 'panel' && b.type === 'panel' && samePanel(a.panel, b.panel)
  }
  return (
    a.direction === b.direction &&
    a.children.length === b.children.length &&
    a.children.every((child, i) => {
      const other = b.children[i]
      return (
        other !== undefined &&
        (!compareSizes || child.size === other.size) &&
        sameLayout(child.node, other.node, compareSizes)
      )
    })
  )
}

function samePanel(a: Panel, b: Panel): boolean {
  if (a.type === 'calendar' || b.type === 'calendar') return a.type === b.type
  return a.kind === b.kind && a.offset === b.offset
}
