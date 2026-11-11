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
  // Vim's h j k l: the cursor moves to the page on that side. Ctrl, not Cmd, on a Mac too.
  {
    id: 'page.moveLeft',
    title: 'Page to the left',
    context: 'global',
    defaultBindings: ['Ctrl+Shift+KeyH'],
  },
  {
    id: 'page.moveDown',
    title: 'Page below',
    context: 'global',
    defaultBindings: ['Ctrl+Shift+KeyJ'],
  },
  {
    id: 'page.moveUp',
    title: 'Page above',
    context: 'global',
    defaultBindings: ['Ctrl+Shift+KeyK'],
  },
  {
    id: 'page.moveRight',
    title: 'Page to the right',
    context: 'global',
    defaultBindings: ['Ctrl+Shift+KeyL'],
  },
  {
    id: 'palette.open',
    title: 'Command palette',
    context: 'global',
    defaultBindings: ['Mod+KeyK'],
  },
  { id: 'page.nextTextSize', title: 'Text size (cycle)', context: 'global', defaultBindings: [] },
  { id: 'settings.open', title: 'Settings…', context: 'global', defaultBindings: [] },
  { id: 'layout.edit', title: 'Edit layout', context: 'global', defaultBindings: [] },
  { id: 'template.editDay', title: 'Edit day template', context: 'global', defaultBindings: [] },
  { id: 'template.editWeek', title: 'Edit week template', context: 'global', defaultBindings: [] },
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
