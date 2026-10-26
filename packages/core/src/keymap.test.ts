import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  bindingFromEvent,
  bindingStatus,
  findConflicts,
  formatBinding,
  lookupCommand,
  parseBinding,
  resolveKeymap,
  type CommandSpec,
  type KeyEventLike,
} from './keymap.ts'

const event = (code: string, mods: Partial<Omit<KeyEventLike, 'code'>> = {}): KeyEventLike => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

describe('parseBinding', () => {
  it('normalizes modifier order and spelling', () => {
    expect(parseBinding('Shift+Mod+KeyJ')).toBe('Mod+Shift+KeyJ')
    expect(parseBinding('alt+ctrl+mod+shift+ArrowRight')).toBe('Mod+Ctrl+Alt+Shift+ArrowRight')
  })

  it.each(['', 'Mod+', 'Mod+Shift', 'Mod+Hyper+KeyJ', 'Mod+Mod+KeyJ', 'Mod+KeyJ+KeyK', 'Mod+J'])(
    'rejects %j',
    (s) => {
      expect(() => parseBinding(s)).toThrow(/Invalid key binding/)
    },
  )

  it('is idempotent', () => {
    fc.assert(
      fc.property(
        fc.subarray(['Mod', 'Ctrl', 'Alt', 'Shift']),
        fc.constantFrom('KeyA', 'KeyZ', 'Digit1', 'ArrowLeft', 'Period', 'Slash', 'F5', 'Escape'),
        (mods, code) => {
          const once = parseBinding([...mods, code].join('+'))
          expect(parseBinding(once)).toBe(once)
        },
      ),
    )
  })
})

describe('matching key events', () => {
  it('maps Mod to Cmd on Mac and to Ctrl elsewhere', () => {
    expect(bindingFromEvent(event('KeyJ', { metaKey: true }), 'mac')).toBe('Mod+KeyJ')
    expect(bindingFromEvent(event('KeyJ', { ctrlKey: true }), 'mac')).toBe('Ctrl+KeyJ')
    expect(bindingFromEvent(event('KeyJ', { ctrlKey: true }), 'other')).toBe('Mod+KeyJ')
  })

  it('uses the physical key, not the produced character', () => {
    // On a Mac, Option+L produces "¬", but the physical key is still KeyL.
    expect(bindingFromEvent(event('KeyL', { altKey: true }), 'mac')).toBe('Alt+KeyL')
  })

  it('returns undefined while only modifier keys are held', () => {
    expect(bindingFromEvent(event('MetaLeft', { metaKey: true }), 'mac')).toBeUndefined()
    expect(bindingFromEvent(event('ShiftRight', { shiftKey: true }), 'other')).toBeUndefined()
  })
})

describe('bindingStatus', () => {
  it.each([
    'Mod+KeyT',
    'Mod+KeyW',
    'Mod+KeyN',
    'Mod+KeyQ',
    'Mod+KeyH',
    'Mod+Shift+KeyT',
    'Mod+Tab',
  ])('marks %s as reserved on Mac', (b) => {
    expect(bindingStatus(b, 'mac')).toBe('reserved')
  })

  it.each(['Mod+KeyT', 'Mod+KeyW', 'Mod+KeyN', 'Mod+Shift+KeyN', 'Alt+F4'])(
    'marks %s as reserved on other platforms',
    (b) => {
      expect(bindingStatus(b, 'other')).toBe('reserved')
    },
  )

  it.each(['Mod+KeyL', 'Mod+BracketLeft', 'Mod+BracketRight', 'Mod+KeyR'])(
    'marks %s as risky',
    (b) => {
      expect(bindingStatus(b, 'mac')).toBe('risky')
      expect(bindingStatus(b, 'other')).toBe('risky')
    },
  )

  it.each(['KeyJ', 'Shift+KeyJ', 'Digit1', 'Space'])(
    'rejects %s because it would fire while typing',
    (b) => {
      expect(bindingStatus(b, 'mac')).toBe('types-text')
    },
  )

  it('rejects Option+key on Mac, which types characters such as @ # [ ] on many layouts', () => {
    expect(bindingStatus('Alt+KeyL', 'mac')).toBe('types-text')
    expect(bindingStatus('Alt+Shift+Digit3', 'mac')).toBe('types-text')
    expect(bindingStatus('Alt+KeyL', 'other')).toBe('ok')
    expect(bindingStatus('Mod+Alt+KeyL', 'mac')).toBe('ok')
  })

  it.each(['Mod+KeyJ', 'Mod+Shift+ArrowRight', 'Escape', 'F2', 'Ctrl+KeyJ'])('accepts %s', (b) => {
    expect(bindingStatus(b, 'mac')).toBe('ok')
  })
})

describe('formatBinding', () => {
  it('uses symbols in Mac order on Mac', () => {
    expect(formatBinding('Mod+Shift+KeyJ', 'mac')).toBe('⇧⌘J')
    expect(formatBinding('Mod+Ctrl+Alt+Shift+ArrowRight', 'mac')).toBe('⌃⌥⇧⌘→')
  })

  it('uses words elsewhere', () => {
    expect(formatBinding('Mod+Shift+KeyJ', 'other')).toBe('Ctrl+Shift+J')
    expect(formatBinding('Alt+Digit1', 'other')).toBe('Alt+1')
    expect(formatBinding('Mod+Period', 'other')).toBe('Ctrl+.')
  })
})

const commands: CommandSpec[] = [
  { id: 'focus.nextDay', context: 'global', defaultBindings: ['Mod+Shift+ArrowRight'] },
  { id: 'focus.previousDay', context: 'global', defaultBindings: ['Mod+Shift+ArrowLeft'] },
  { id: 'palette.open', context: 'global', defaultBindings: ['Mod+KeyK'] },
  { id: 'editor.toggleCheckbox', context: 'editor', defaultBindings: ['Mod+Enter'] },
]

describe('resolveKeymap', () => {
  it('uses the defaults when there are no overrides', () => {
    expect(resolveKeymap(commands, {})).toContainEqual({
      commandId: 'focus.nextDay',
      context: 'global',
      binding: 'Mod+Shift+ArrowRight',
    })
  })

  it('replaces the defaults of overridden commands, and an empty override unbinds', () => {
    const keymap = resolveKeymap(commands, {
      'focus.nextDay': ['Mod+KeyJ', 'mod+shift+KeyL'],
      'palette.open': [],
    })

    expect(keymap.filter((e) => e.commandId === 'focus.nextDay').map((e) => e.binding)).toEqual([
      'Mod+KeyJ',
      'Mod+Shift+KeyL',
    ])
    expect(keymap.some((e) => e.commandId === 'palette.open')).toBe(false)
  })

  it('ignores overrides for unknown commands and invalid bindings', () => {
    const keymap = resolveKeymap(commands, {
      'removed.command': ['Mod+KeyJ'],
      'focus.nextDay': ['Mod+Nope+KeyJ', 'Mod+KeyJ'],
    })

    expect(keymap.some((e) => e.commandId === 'removed.command')).toBe(false)
    expect(keymap.filter((e) => e.commandId === 'focus.nextDay').map((e) => e.binding)).toEqual([
      'Mod+KeyJ',
    ])
  })
})

describe('findConflicts', () => {
  it('finds commands sharing a binding in overlapping contexts', () => {
    const keymap = resolveKeymap(commands, {
      'focus.previousDay': ['Mod+KeyK'],
      'editor.toggleCheckbox': ['Mod+Shift+ArrowRight'],
    })

    expect(findConflicts(keymap)).toEqual([
      { binding: 'Mod+Shift+ArrowRight', commandIds: ['focus.nextDay', 'editor.toggleCheckbox'] },
      { binding: 'Mod+KeyK', commandIds: ['focus.previousDay', 'palette.open'] },
    ])
  })

  it('reports nothing for the defaults', () => {
    expect(findConflicts(resolveKeymap(commands, {}))).toEqual([])
  })
})

describe('lookupCommand', () => {
  const keymap = resolveKeymap(commands, { 'editor.toggleCheckbox': ['Mod+Enter', 'Mod+KeyK'] })

  it('finds the global command for a key event', () => {
    expect(
      lookupCommand(
        keymap,
        event('ArrowRight', { metaKey: true, shiftKey: true }),
        'global',
        'mac',
      ),
    ).toBe('focus.nextDay')
  })

  it('requires the exact modifiers', () => {
    expect(
      lookupCommand(keymap, event('ArrowRight', { metaKey: true }), 'global', 'mac'),
    ).toBeUndefined()
  })

  it('does not run editor commands outside the editor', () => {
    expect(
      lookupCommand(keymap, event('Enter', { metaKey: true }), 'global', 'mac'),
    ).toBeUndefined()
    expect(lookupCommand(keymap, event('Enter', { metaKey: true }), 'editor', 'mac')).toBe(
      'editor.toggleCheckbox',
    )
  })

  it('prefers the editor command over a global one inside the editor', () => {
    expect(lookupCommand(keymap, event('KeyK', { metaKey: true }), 'editor', 'mac')).toBe(
      'editor.toggleCheckbox',
    )
    expect(lookupCommand(keymap, event('KeyK', { metaKey: true }), 'global', 'mac')).toBe(
      'palette.open',
    )
  })

  it('runs global commands inside the editor', () => {
    expect(
      lookupCommand(keymap, event('ArrowLeft', { metaKey: true, shiftKey: true }), 'editor', 'mac'),
    ).toBe('focus.previousDay')
  })
})
