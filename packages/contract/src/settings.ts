import { ISO_WEEK, OPEN_PLANNER, parseBinding } from '@agendina/core'
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

export const UserSettings = z.object({
  weekRule: WeekRule,
  /** Command id → bindings, replacing the command's defaults. An empty list unbinds it. */
  keymap: z
    .record(z.string().max(100), z.array(Binding).max(5))
    .refine((keymap) => Object.keys(keymap).length <= 200, 'Too many commands'),
  layout: LayoutSchema,
  // A default, so settings stored before focus mode existed stay valid.
  focusMode: FocusModeSettings.default(DEFAULT_FOCUS_MODE),
})
export type UserSettings = z.infer<typeof UserSettings>

export const DEFAULT_SETTINGS: UserSettings = {
  weekRule: ISO_WEEK,
  keymap: {},
  layout: OPEN_PLANNER,
  focusMode: DEFAULT_FOCUS_MODE,
}

export const SettingsResponse = z.object({ settings: UserSettings })
export type SettingsResponse = z.infer<typeof SettingsResponse>
