import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { history, undo } from '@codemirror/commands'
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { nestListItems } from './lists.ts'

const lines = (...l: string[]) => l.join('\n')

/** `‸` marks the cursor; a second `‸` makes the selection run from the first to the second. */
function state(docWithCursor: string): EditorState {
  const first = docWithCursor.indexOf('‸')
  const second = docWithCursor.indexOf('‸', first + 1)
  const doc = docWithCursor.replaceAll('‸', '')
  return EditorState.create({
    doc,
    selection:
      second === -1 ? EditorSelection.cursor(first) : EditorSelection.single(first, second - 1),
    extensions: [markdown({ base: markdownLanguage }), history()],
  })
}

function after(s: EditorState, spec: TransactionSpec | undefined): string {
  if (spec === undefined) return 'unchanged'
  return s.update(spec).state.doc.toString()
}

describe('nestListItems (Tab / Shift+Tab in lists)', () => {
  it.each([
    ['bullet', lines('- a', '- b‸'), lines('- a', '  - b')],
    ['star', lines('* a', '* b‸'), lines('* a', '  * b')],
    ['to-do', lines('- [ ] a', '- [x] b‸'), lines('- [ ] a', '  - [x] b')],
    ['ordered', lines('1. a', '2. b‸'), lines('1. a', '   2. b')],
    ['two-digit ordered', lines('10. a', '11. b‸'), lines('10. a', '    11. b')],
  ])('nests a %s item under the item above', (_name, doc, expected) => {
    const s = state(doc)
    expect(after(s, nestListItems(s, 1))).toBe(expected)
  })

  it('nests one more level under a sibling that is already nested', () => {
    const s = state(lines('- a', '  - b', '  - c‸'))
    expect(after(s, nestListItems(s, 1))).toBe(lines('- a', '  - b', '    - c'))
  })

  it('does nothing on the first item, which has nothing to nest under', () => {
    const s = state('- a‸')
    expect(nestListItems(s, 1)).toBeUndefined()
  })

  it('un-nests to the parent level', () => {
    const s = state(lines('- a', '  - b‸'))
    expect(after(s, nestListItems(s, -1))).toBe(lines('- a', '- b'))
  })

  it('does nothing when un-nesting a top-level item', () => {
    const s = state(lines('- a', '- b‸'))
    expect(nestListItems(s, -1)).toBeUndefined()
  })

  it('nests every item of a multi-line selection and nothing else', () => {
    const s = state(lines('- a', '- ‸b', '- c', '- d‸', '', 'text'))
    expect(after(s, nestListItems(s, 1))).toBe(lines('- a', '  - b', '  - c', '  - d', '', 'text'))
  })

  it('un-nests every item of a multi-line selection', () => {
    const s = state(lines('- a', '  - ‸b', '  - c‸'))
    expect(after(s, nestListItems(s, -1))).toBe(lines('- a', '- b', '- c'))
  })

  it('leaves lines outside the selected items untouched', () => {
    const s = state(lines('- a', '‸- b', '', 'plain', '', '- c‸'))
    expect(after(s, nestListItems(s, 1))).toBe(lines('- a', '  - b', '', 'plain', '', '- c'))
  })

  it('carries the children of a nested item along', () => {
    const s = state(lines('- a', '- b‸', '  - c', '    - d', '- e'))
    expect(after(s, nestListItems(s, 1))).toBe(lines('- a', '  - b', '    - c', '      - d', '- e'))
  })

  it('carries the children along when un-nesting', () => {
    const s = state(lines('- a', '  - b‸', '    - c'))
    expect(after(s, nestListItems(s, -1))).toBe(lines('- a', '- b', '  - c'))
  })

  it('carries continuation lines of the item', () => {
    const s = state(lines('- a', '- b‸', '  more of b'))
    expect(after(s, nestListItems(s, 1))).toBe(lines('- a', '  - b', '    more of b'))
  })

  it('moves a lazy continuation line along with its item', () => {
    const s = state(lines('- a', '- b‸', 'plain'))
    expect(after(s, nestListItems(s, 1))).toBe(lines('- a', '  - b', '  plain'))
  })

  it('moves the children of a selected parent that cannot move itself', () => {
    const out = state(lines('‸- a', '  - b', '  - c‸'))
    expect(after(out, nestListItems(out, -1))).toBe(lines('- a', '- b', '- c'))
    const inn = state(lines('‸- a', '  - b', '  - c‸'))
    expect(after(inn, nestListItems(inn, 1))).toBe(lines('- a', '  - b', '    - c'))
  })

  it('moves the item when the cursor is on one of its continuation lines', () => {
    const s = state(lines('- a', '- b', '  more‸'))
    expect(after(s, nestListItems(s, 1))).toBe(lines('- a', '  - b', '    more'))
  })

  it('nests under an item that is just a marker, indented past the marker', () => {
    const s = state(lines('- a', '-', '- b‸'))
    expect(after(s, nestListItems(s, 1))).toBe(lines('- a', '-', '  - b'))
  })

  it('keeps the structure when a parent and its children are selected, at three levels', () => {
    const s = state(lines('- a', '- ‸b', '  - c', '    - d‸', '- e'))
    expect(after(s, nestListItems(s, 1))).toBe(lines('- a', '  - b', '    - c', '      - d', '- e'))
  })

  it('does not include the next line when the selection ends at its start', () => {
    const s = state(lines('- a', '- ‸b', '- c', '‸- d'))
    expect(after(s, nestListItems(s, 1))).toBe(lines('- a', '  - b', '  - c', '- d'))
  })

  it('only nests under a previous item of the same list', () => {
    const s = state(lines('## Mon', '- x', '## Tue', '- b‸'))
    expect(nestListItems(s, 1)).toBeUndefined()
  })

  it('does not treat horizontal rules as list items', () => {
    const s = state(lines('- a', '', '* * *', '- b‸'))
    expect(nestListItems(s, 1)).toBeUndefined()
    const rule = state(lines('- a', '- - -‸'))
    expect(nestListItems(rule, 1)).toBeUndefined()
  })

  it('puts a cursor at the start of the line after the indent', () => {
    const s = state(lines('- a', '‸- b'))
    const spec = nestListItems(s, 1)
    if (spec === undefined) throw new Error('expected a change')
    expect(s.update(spec).state.selection.main.head).toBe('- a\n  '.length)
  })

  it('nests and un-nests tab-indented items without stray spaces', () => {
    const nested = state(lines('- a', '\t- b', '\t- c‸'))
    expect(after(nested, nestListItems(nested, 1))).toBe(lines('- a', '\t- b', '\t  - c'))
    const out = state(lines('- a', '\t- b‸'))
    expect(after(out, nestListItems(out, -1))).toBe(lines('- a', '- b'))
  })

  it('is undone in one step', () => {
    const s = state(lines('- a', '- ‸b', '  - c', '- d‸'))
    const spec = nestListItems(s, 1)
    if (spec === undefined) throw new Error('expected a change')
    let current = s.update({ ...spec, userEvent: 'input' }).state
    undo({ state: current, dispatch: (tr) => (current = tr.state) })
    expect(current.doc.toString()).toBe(s.doc.toString())
  })

  it('keeps the cursor in the same place in the text', () => {
    const s = state(lines('- a', '- b‸'))
    const spec = nestListItems(s, 1)
    if (spec === undefined) throw new Error('expected a change')
    expect(s.update(spec).state.selection.main.head).toBe('- a\n  - b'.length)
  })

  it('does nothing on a plain line', () => {
    const s = state('just text‸')
    expect(nestListItems(s, 1)).toBeUndefined()
    expect(nestListItems(s, -1)).toBeUndefined()
  })

  it('does not touch list-looking lines in a fenced code block', () => {
    const s = state(lines('```', '- a', '- b‸', '```'))
    expect(nestListItems(s, 1)).toBeUndefined()
  })
})
