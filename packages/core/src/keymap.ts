/**
 * A key binding in canonical form, e.g. `Mod+Shift+KeyJ`: modifiers in the order
 * Mod, Ctrl, Alt, Shift, then a `KeyboardEvent.code` (the physical key, independent of the
 * keyboard layout). `Mod` is Cmd on Mac and Ctrl elsewhere.
 */
export type Binding = string

export type Platform = 'mac' | 'other'

export type CommandContext = 'global' | 'editor'

export interface CommandSpec<Id extends string = string> {
  id: Id
  /** `editor` commands only run while an editor has focus; `global` ones run everywhere. */
  context: CommandContext
  defaultBindings: readonly Binding[]
}

export interface KeymapEntry<Id extends string = string> {
  commandId: Id
  context: CommandContext
  binding: Binding
}

/** User overrides: replace a command's default bindings. An empty list unbinds the command. */
export type KeymapOverrides = Record<string, string[]>

/** The parts of a DOM `KeyboardEvent` that matter here (`core` has no DOM types). */
export interface KeyEventLike {
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/**
 * - `reserved`: the browser or OS handles it before the page can.
 * - `risky`: some browsers let the page override it, others do not.
 * - `types-text`: it would fire while typing.
 */
export type BindingStatus = 'ok' | 'reserved' | 'risky' | 'types-text'

const MODIFIERS = ['Mod', 'Ctrl', 'Alt', 'Shift'] as const
type Modifier = (typeof MODIFIERS)[number]

const NAMED_KEYS = new Set([
  'Escape',
  'Enter',
  'Tab',
  'Space',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Semicolon',
  'Quote',
  'Backquote',
  'Comma',
  'Period',
  'Slash',
  'IntlBackslash',
])

const KEY_PATTERN =
  /^(Key[A-Z]|Digit[0-9]|Numpad[0-9A-Za-z]+|Arrow(Up|Down|Left|Right)|F([1-9]|1[0-9]|2[0-4]))$/

const RESERVED: Record<Platform, Set<Binding>> = {
  mac: new Set([
    'Mod+KeyT',
    'Mod+KeyW',
    'Mod+KeyN',
    'Mod+KeyQ',
    'Mod+KeyH',
    'Mod+KeyM',
    'Mod+Tab',
    'Mod+Space',
    'Mod+Shift+KeyT',
    'Mod+Shift+KeyN',
    'Mod+Shift+KeyW',
    'Mod+Alt+KeyH',
  ]),
  other: new Set([
    'Mod+KeyT',
    'Mod+KeyW',
    'Mod+KeyN',
    'Mod+Tab',
    'Mod+Shift+KeyT',
    'Mod+Shift+KeyN',
    'Mod+Shift+KeyW',
    'Mod+Shift+Tab',
    'Alt+F4',
  ]),
}

const RISKY = new Set([
  'Mod+KeyL',
  'Mod+BracketLeft',
  'Mod+BracketRight',
  'Mod+KeyR',
  'Mod+Shift+KeyR',
])

export function parseBinding(value: string): Binding {
  const parts = value.split('+')
  const code = parts.pop() ?? ''
  if (!isKeyCode(code)) throw invalid(value)

  const modifiers = new Set<Modifier>()
  for (const part of parts) {
    const modifier = MODIFIERS.find((m) => m.toLowerCase() === part.toLowerCase())
    if (modifier === undefined || modifiers.has(modifier)) throw invalid(value)
    modifiers.add(modifier)
  }
  return [...MODIFIERS.filter((m) => modifiers.has(m)), code].join('+')
}

/** The binding pressed in a key event, or undefined while only modifier keys are down. */
export function bindingFromEvent(event: KeyEventLike, platform: Platform): Binding | undefined {
  if (!isKeyCode(event.code)) return undefined
  const modifiers: Modifier[] = []
  if (platform === 'mac') {
    if (event.metaKey) modifiers.push('Mod')
    if (event.ctrlKey) modifiers.push('Ctrl')
  } else {
    if (event.metaKey) return undefined // The OS (Windows/Super) key belongs to the OS.
    if (event.ctrlKey) modifiers.push('Mod')
  }
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  return [...modifiers, event.code].join('+')
}

export function bindingStatus(binding: Binding, platform: Platform): BindingStatus {
  const normalized = forPlatform(binding, platform)
  if (RESERVED[platform].has(normalized)) return 'reserved'
  if (RISKY.has(normalized)) return 'risky'

  const { modifiers, code } = split(normalized)
  const hasCommandModifier = modifiers.has('Mod') || modifiers.has('Ctrl')
  if (!hasCommandModifier && !modifiers.has('Alt') && !/^(F\d+|Escape)$/.test(code)) {
    return 'types-text'
  }
  // Option+key types characters on Mac (e.g. @ # [ ] on Italian layouts).
  if (platform === 'mac' && !hasCommandModifier && modifiers.has('Alt')) return 'types-text'
  return 'ok'
}

export function formatBinding(binding: Binding, platform: Platform): string {
  const { modifiers, code } = split(forPlatform(binding, platform))
  const key = keyLabel(code, platform)
  if (platform === 'mac') {
    const symbols: [Modifier, string][] = [
      ['Ctrl', '⌃'],
      ['Alt', '⌥'],
      ['Shift', '⇧'],
      ['Mod', '⌘'],
    ]
    return symbols.map(([m, s]) => (modifiers.has(m) ? s : '')).join('') + key
  }
  const words: [Modifier, string][] = [
    ['Mod', 'Ctrl'],
    ['Alt', 'Alt'],
    ['Shift', 'Shift'],
  ]
  return [...words.filter(([m]) => modifiers.has(m)).map(([, w]) => w), key].join('+')
}

export function resolveKeymap<Id extends string>(
  commands: readonly CommandSpec<Id>[],
  overrides: KeymapOverrides,
): KeymapEntry<Id>[] {
  return commands.flatMap((command) => {
    const bindings = overrides[command.id] ?? command.defaultBindings
    const valid = new Set(bindings.flatMap((b) => tryParseBinding(b) ?? []))
    return [...valid].map((binding) => ({
      commandId: command.id,
      context: command.context,
      binding,
    }))
  })
}

/**
 * Bindings assigned to more than one command. Global commands also run inside the editor, so
 * any two contexts overlap and every shared binding is a conflict.
 */
export function findConflicts(keymap: KeymapEntry[]): { binding: Binding; commandIds: string[] }[] {
  const byBinding = new Map<Binding, string[]>()
  for (const entry of keymap) {
    const ids = byBinding.get(entry.binding) ?? []
    if (!ids.includes(entry.commandId)) ids.push(entry.commandId)
    byBinding.set(entry.binding, ids)
  }
  return [...byBinding]
    .filter(([, commandIds]) => commandIds.length > 1)
    .map(([binding, commandIds]) => ({ binding, commandIds }))
}

/** The command to run for a key event. Inside an editor, editor commands win over global ones. */
export function lookupCommand<Id extends string>(
  keymap: KeymapEntry<Id>[],
  event: KeyEventLike,
  activeContext: CommandContext,
  platform: Platform,
): Id | undefined {
  const pressed = bindingFromEvent(event, platform)
  if (pressed === undefined) return undefined
  const matches = keymap.filter((e) => forPlatform(e.binding, platform) === pressed)
  const preferred =
    activeContext === 'editor' ? matches.find((e) => e.context === 'editor') : undefined
  return (preferred ?? matches.find((e) => e.context === 'global'))?.commandId
}

/** Off Mac, Ctrl and Mod are the same key. */
function forPlatform(binding: Binding, platform: Platform): Binding {
  if (platform === 'mac') return binding
  const { modifiers, code } = split(binding)
  if (modifiers.delete('Ctrl')) modifiers.add('Mod')
  return [...MODIFIERS.filter((m) => modifiers.has(m)), code].join('+')
}

function split(binding: Binding): { modifiers: Set<Modifier>; code: string } {
  const parts = binding.split('+')
  const code = parts.pop() ?? ''
  return { modifiers: new Set(parts as Modifier[]), code }
}

function tryParseBinding(value: string): Binding | undefined {
  try {
    return parseBinding(value)
  } catch {
    return undefined
  }
}

function isKeyCode(code: string): boolean {
  return NAMED_KEYS.has(code) || KEY_PATTERN.test(code)
}

function invalid(value: string): Error {
  return new Error(`Invalid key binding ${JSON.stringify(value)}`)
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Escape: 'Esc',
  Space: 'Space',
}

const MAC_KEY_LABELS: Record<string, string> = {
  Enter: '↩',
  Tab: '⇥',
  Backspace: '⌫',
  Delete: '⌦',
}

function keyLabel(code: string, platform: Platform): string {
  if (platform === 'mac' && code in MAC_KEY_LABELS) return MAC_KEY_LABELS[code] as string
  if (code in KEY_LABELS) return KEY_LABELS[code] as string
  return code.replace(/^(Key|Digit|Numpad)/, '')
}
