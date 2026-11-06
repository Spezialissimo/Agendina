import type { CommandSpec } from '@agendina/core'

export interface Command extends CommandSpec {
  /** Shown in the command palette. */
  title: string
}

/**
 * Every command, in palette order. Default bindings avoid what macOS text editing, VoiceOver and
 * the browsers already use (ADR 0007): ⇧⌘, and ⇧⌘. are the `<` and `>` keys.
 */
export const COMMANDS = [
  {
    id: 'focus.previousDay',
    title: 'Previous day',
    context: 'global',
    defaultBindings: ['Mod+Shift+Comma'],
  },
  {
    id: 'focus.nextDay',
    title: 'Next day',
    context: 'global',
    defaultBindings: ['Mod+Shift+Period'],
  },
  {
    id: 'focus.previousWeek',
    title: 'Previous week',
    context: 'global',
    defaultBindings: ['Mod+Alt+Shift+Comma'],
  },
  {
    id: 'focus.nextWeek',
    title: 'Next week',
    context: 'global',
    defaultBindings: ['Mod+Alt+Shift+Period'],
  },
  { id: 'focus.today', title: 'Today', context: 'global', defaultBindings: ['Mod+Alt+KeyT'] },
  { id: 'calendar.open', title: 'Choose a day…', context: 'global', defaultBindings: [] },
  {
    id: 'palette.open',
    title: 'Command palette',
    context: 'global',
    defaultBindings: ['Mod+KeyK'],
  },
  { id: 'page.nextTextSize', title: 'Text size (cycle)', context: 'global', defaultBindings: [] },
  { id: 'settings.open', title: 'Settings…', context: 'global', defaultBindings: [] },
  { id: 'account.signOut', title: 'Sign out', context: 'global', defaultBindings: [] },
  {
    id: 'editor.toggleCheckbox',
    title: 'Toggle to-do',
    context: 'editor',
    defaultBindings: ['Mod+Enter'],
  },
  {
    id: 'editor.addTableRow',
    title: 'Add table row',
    context: 'editor',
    defaultBindings: ['Mod+Alt+Enter'],
  },
  {
    id: 'editor.addTableColumn',
    title: 'Add table column',
    context: 'editor',
    defaultBindings: [],
  },
] as const satisfies readonly Command[]

export type CommandId = (typeof COMMANDS)[number]['id']
