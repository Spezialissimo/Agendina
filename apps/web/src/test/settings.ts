import { DEFAULT_SETTINGS, UserSettings } from '@agendina/contract'
import type { Layout } from '@agendina/core'

/** The default settings showing `layout` on the desktop, as a custom layout unless a preset. */
export function settingsWithLayout(layout: Layout, settings: Partial<UserSettings> = {}) {
  return UserSettings.parse({ ...DEFAULT_SETTINGS, ...settings, layout, layouts: undefined })
}
