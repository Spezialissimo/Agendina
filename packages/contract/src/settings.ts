import {
  ISO_WEEK,
  OPEN_PLANNER,
  parseBinding,
  parseLayout,
  type Layout,
  type WeekRule as CoreWeekRule,
} from '@agendina/core'
import { z } from 'zod'

const OneToSeven = z.number().int().min(1).max(7)

export const WeekRule = z.object({
  firstDay: OneToSeven.transform((n) => n as CoreWeekRule['firstDay']),
  minimalDays: OneToSeven.transform((n) => n as CoreWeekRule['minimalDays']),
})

/** A key binding, normalized to canonical form (`Mod+Shift+KeyJ`). */
const Binding = z.string().transform((value, ctx) => {
  try {
    return parseBinding(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: `Invalid key binding ${JSON.stringify(value)}` })
    return z.NEVER
  }
})

const LayoutSchema = z.unknown().transform((value, ctx): Layout => {
  try {
    return parseLayout(value)
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid layout',
    })
    return z.NEVER
  }
})

export const UserSettings = z.object({
  weekRule: WeekRule,
  /** Command id → bindings, replacing the command's defaults. An empty list unbinds it. */
  keymap: z
    .record(z.string().max(100), z.array(Binding).max(5))
    .refine((keymap) => Object.keys(keymap).length <= 200, 'Too many commands'),
  layout: LayoutSchema,
})
export type UserSettings = z.infer<typeof UserSettings>

export const DEFAULT_SETTINGS: UserSettings = {
  weekRule: ISO_WEEK,
  keymap: {},
  layout: OPEN_PLANNER,
}

export const SettingsResponse = z.object({ settings: UserSettings })
export type SettingsResponse = z.infer<typeof SettingsResponse>
