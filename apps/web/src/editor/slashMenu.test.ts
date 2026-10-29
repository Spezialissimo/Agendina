import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { ISO_WEEK, US_WEEK } from '@agendina/core'
import { describe, expect, it } from 'vitest'
import { SLASH_ITEMS, slashEdit, slashSource } from './slashMenu.ts'

function state(docWithCursor: string): EditorState {
  const at = docWithCursor.indexOf('‸')
  const doc = docWithCursor.slice(0, at) + docWithCursor.slice(at + 1)
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(at),
    extensions: [markdown({ base: markdownLanguage })],
  })
}

function complete(docWithCursor: string): CompletionResult | null {
  const s = state(docWithCursor)
  return slashSource(() => ISO_WEEK)(new CompletionContext(s, s.selection.main.head, false))
}

/** Applies a menu item replacing the `/query` before the cursor; shows the cursor as ‸. */
function apply(docWithCursor: string, label: string, rule = ISO_WEEK): string {
  const s = state(docWithCursor)
  const result = complete(docWithCursor)
  const item = SLASH_ITEMS.find((i) => i.label === label)
  if (result === null || item === undefined) throw new Error('no menu')
  const next = s.update(slashEdit(item, rule, result.from - 1, s.selection.main.head)).state
  const head = next.selection.main.head
  const doc = next.doc.toString()
  return doc.slice(0, head) + '‸' + doc.slice(head)
}

describe('slash menu', () => {
  it.each(['/‸', 'notes\n/‸', '  /to‸', '/he‸'])('opens at the start of a line: %j', (doc) => {
    expect(complete(doc)?.options.map((o) => o.label)).toEqual(SLASH_ITEMS.map((i) => i.label))
  })

  it.each(['and/‸', '26/10‸', 'a /‸'])('stays closed after other text: %j', (doc) => {
    expect(complete(doc)).toBeNull()
  })

  it('keeps its own order (most used first) rather than alphabetical', () => {
    const options = complete('/‸')?.options ?? []
    const boosts = options.map((o) => o.boost ?? 0)
    expect(boosts).toEqual([...boosts].sort((a, b) => b - a))
    expect(new Set(boosts).size).toBe(options.length)
  })

  it('filters on what is typed after "/"', () => {
    // CodeMirror matches the options against the text from `from`: it must not include the "/".
    expect(complete('notes\n/to‸')?.from).toBe('notes\n/'.length)
  })

  it.each([
    ['Heading 1', '# ‸'],
    ['Heading 2', '## ‸'],
    ['Heading 3', '### ‸'],
    ['To-do', '- [ ] ‸'],
    ['Bullet list', '- ‸'],
    ['Numbered list', '1. ‸'],
    ['Quote', '> ‸'],
    ['Divider', '---\n‸'],
    ['Code block', '```\n‸\n```'],
  ])('%s', (label, expected) => {
    expect(apply('/x‸', label)).toBe(expected)
  })

  it('keeps indentation', () => {
    expect(apply('  /‸', 'To-do')).toBe('  - [ ] ‸')
  })

  it('inserts a table with the cursor in the first header cell', () => {
    expect(apply('/‸', 'Table')).toBe('| ‸    |     |\n| --- | --- |\n|     |     |')
  })

  it('inserts a week tracker following the week rule', () => {
    expect(apply('/‸', 'Week tracker')).toBe(
      [
        '|     | Mo  | Tu  | We  | Th  | Fr  | Sa  | Su  |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        '| ‸    | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |',
      ].join('\n'),
    )
    expect(apply('/‸', 'Week tracker', US_WEEK).split('\n')[0]).toBe(
      '|     | Su  | Mo  | Tu  | We  | Th  | Fr  | Sa  |',
    )
  })
})
