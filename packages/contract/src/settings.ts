import {
  DEFAULT_LAYOUTS,
  ISO_WEEK,
  MAX_LAYOUT_NAME,
  MAX_PANELS,
  OPEN_PLANNER,
  PRESETS,
  activeLayout,
  adoptLegacyLayout,
  parseBinding,
  type Layouts as LayoutsType,
} from '@agendina/core'
import { z } from 'zod'
import { LayoutSchema } from './layout.ts'

const OneToSeven = z.literal([1, 2, 3, 4, 5, 6, 7])

export const WeekRule = z.object({ firstDay: OneToSeven, minimalDays: OneToSeven })

/** A key binding, normalized to canonical form (`Mod+Shift+KeyJ`). */
const Binding = z.string().transform((value, ctx) => {
  try {
    return parseBinding(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: `Invalid key binding ${JSON.stringify(value)}` })
    return z.NEVER
  }
})

/** Focus mode (ADR 0013): whether it is on, and how long the mouse must rest before it starts. */
const FocusModeSettings = z.object({
  enabled: z.boolean(),
  idleMs: z.number().int().min(500).max(60_000),
})
type FocusModeSettings = z.infer<typeof FocusModeSettings>

export const DEFAULT_FOCUS_MODE: FocusModeSettings = { enabled: true, idleMs: 1500 }

export const MAX_CUSTOM_LAYOUTS = 100

const LayoutId = z.string().min(1).max(50)

const Sizes = z.record(LayoutId, z.array(z.number().positive()).min(1).max(MAX_PANELS))

/** The named layouts and the one each type of screen shows (ADR 0005). */
export const Layouts: z.ZodType<LayoutsType> = z
  .object({
    custom: z
      .array(
        z.object({
          id: LayoutId,
          name: z
            .string()
            .max(MAX_LAYOUT_NAME)
            .refine((name) => name.trim() !== '', 'A layout needs a name'),
          layout: LayoutSchema,
        }),
      )
      .max(MAX_CUSTOM_LAYOUTS),
    presetSizes: z
      .record(LayoutId, Sizes)
      .refine((sizes) => Object.keys(sizes).length <= 50, 'Too many presets'),
    active: z.object({ desktop: LayoutId, phone: LayoutId }),
  })
  .superRefine((layouts, ctx) => {
    const ids = [...PRESETS.map((p) => p.id), ...layouts.custom.map((c) => c.id)]
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'Two layouts have the same id' })
    }
    for (const id of Object.values(layouts.active)) {
      if (!ids.includes(id)) ctx.addIssue({ code: 'custom', message: `No layout "${id}"` })
    }
  })
export type Layouts = LayoutsType

/**
 * Settings as a client sends them. `layouts` is missing when a tab still runs the release before
 * named layouts: the server then takes `layout` into the stored layouts (`adoptLegacyLayout`).
 */
export const SettingsUpdate = z.object({
  weekRule: WeekRule,
  /** Command id → bindings, replacing the command's defaults. An empty list unbinds it. */
  keymap: z
    .record(z.string().max(100), z.array(Binding).max(5))
    .refine((keymap) => Object.keys(keymap).length <= 200, 'Too many commands'),
  /**
   * The active desktop layout, for the previous release (ADR 0012). Always overwritten from
   * `layouts`. Drop it a release after named layouts.
   */
  layout: LayoutSchema,
  layouts: Layouts.optional(),
  // A default, so settings stored before focus mode existed stay valid.
  focusMode: FocusModeSettings.default(DEFAULT_FOCUS_MODE),
})
export type SettingsUpdate = z.infer<typeof SettingsUpdate>

export const UserSettings = SettingsUpdate.transform((settings) => {
  const layouts = settings.layouts ?? adoptLegacyLayout(DEFAULT_LAYOUTS, settings.layout)
  return { ...settings, layouts, layout: activeLayout(layouts, 'desktop').layout }
})
export type UserSettings = z.infer<typeof UserSettings>

export const DEFAULT_SETTINGS: UserSettings = {
  weekRule: ISO_WEEK,
  keymap: {},
  layout: OPEN_PLANNER,
  layouts: DEFAULT_LAYOUTS,
  focusMode: DEFAULT_FOCUS_MODE,
}

/** `settings` showing `layouts`, with the single layout kept in step. */
export function withLayouts(settings: UserSettings, layouts: LayoutsType): UserSettings {
  return { ...settings, layouts, layout: activeLayout(layouts, 'desktop').layout }
}

export const SettingsResponse = z.object({ settings: UserSettings })
export type SettingsResponse = z.infer<typeof SettingsResponse>
