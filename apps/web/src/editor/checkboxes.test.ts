import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { findCheckboxes, toggleAtCursor, toggleCheckbox, type Checkbox } from './checkboxes.ts'

function state(docWithCursor: string): EditorState {
  const at = docWithCursor.indexOf('‸')
  const doc = at === -1 ? docWithCursor : docWithCursor.slice(0, at) + docWithCursor.slice(at + 1)
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(at === -1 ? 0 : at),
    extensions: [markdown({ base: markdownLanguage })],
  })
}

const apply = (s: EditorState, spec: TransactionSpec | undefined) =>
  spec === undefined ? s.doc.toString() : s.update(spec).state.doc.toString()

function must(box: Checkbox | undefined): Checkbox {
  if (box === undefined) throw new Error('missing checkbox')
  return box
}

const WORKOUT = [
  '| Exercise | Mo | We |',
  '|---|---|---|',
  '| Squat | [x] | [ ] |',
  '| Bench | [ ] | notes |',
].join('\n')

describe('findCheckboxes', () => {
  it('finds to-dos with their text as label', () => {
    const s = state('- [ ] Finish report\n- [x] Call dentist\n* [X] Upper case\n- plain item')

    expect(findCheckboxes(s).map(({ checked, label, kind }) => ({ checked, label, kind }))).toEqual(
      [
        { checked: false, label: 'Finish report', kind: 'task' },
        { checked: true, label: 'Call dentist', kind: 'task' },
        { checked: true, label: 'Upper case', kind: 'task' },
      ],
    )
  })

  it('finds table cells that are a checkbox, labelled by row and column', () => {
    const s = state(WORKOUT)

    expect(findCheckboxes(s).map(({ checked, label, kind }) => ({ checked, label, kind }))).toEqual(
      [
        { checked: true, label: 'Squat, Mo', kind: 'cell' },
        { checked: false, label: 'Squat, We', kind: 'cell' },
        { checked: false, label: 'Bench, Mo', kind: 'cell' },
      ],
    )
  })

  it('labels a to-do with its own line only, even when the next line continues the item', () => {
    const s = state('- [ ] Call dentist\nnotes right below')

    expect(findCheckboxes(s).map((b) => b.label)).toEqual(['Call dentist'])
  })

  it('reports the exact range of each box', () => {
    const s = state('- [ ] Finish report')
    const [box] = findCheckboxes(s)

    expect(box && s.doc.sliceString(box.from, box.to)).toBe('[ ]')
  })
})

describe('toggleCheckbox', () => {
  it('checks and unchecks to-dos and table cells', () => {
    const tasks = state('- [ ] Finish report\n- [x] Call dentist')
    const [open, done] = findCheckboxes(tasks)
    expect(apply(tasks, { changes: toggleCheckbox(must(open)) })).toBe(
      '- [x] Finish report\n- [x] Call dentist',
    )
    expect(apply(tasks, { changes: toggleCheckbox(must(done)) })).toBe(
      '- [ ] Finish report\n- [ ] Call dentist',
    )

    const table = state(WORKOUT)
    const weCell = findCheckboxes(table).find((b) => b.label === 'Squat, We')
    expect(apply(table, { changes: toggleCheckbox(must(weCell)) })).toContain(
      '| Squat | [x] | [x] |',
    )
  })
})

describe('toggleAtCursor (⌘↩)', () => {
  it.each([
    ['toggles the to-do on the line', '- [ ] Fin‸ish report', '- [x] Finish report'],
    ['unchecks a done to-do', '- [x] Fin‸ish report', '- [ ] Finish report'],
    ['turns a list item into a to-do', '- Fin‸ish report', '- [ ] Finish report'],
    ['turns a plain line into a to-do', 'Fin‸ish report', '- [ ] Finish report'],
    ['starts a to-do on an empty line', 'notes\n‸', 'notes\n- [ ] '],
    ['keeps indentation', '  - Fin‸ish report', '  - [ ] Finish report'],
  ])('%s', (_, before, after) => {
    const s = state(before)
    expect(apply(s, toggleAtCursor(s))).toBe(after)
  })

  it('toggles the table cell checkbox under the cursor', () => {
    const doc = WORKOUT.replace('| Squat | [x] | [ ] |', '| Squat | [x] | [‸ ] |')
    const s = state(doc)

    expect(apply(s, toggleAtCursor(s))).toContain('| Squat | [x] | [x] |')
  })

  it('does nothing elsewhere in a table', () => {
    const s = state(WORKOUT.replace('| Exercise |', '| Exer‸cise |'))

    expect(toggleAtCursor(s)).toBeUndefined()
  })

  it('keeps the cursor on the same text', () => {
    const s = state('- Fin‸ish report')
    const next = s.update(toggleAtCursor(s) ?? {}).state

    expect(next.doc.sliceString(next.selection.main.head)).toBe('ish report')
  })
})
