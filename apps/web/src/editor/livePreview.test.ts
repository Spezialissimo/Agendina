import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { livePreview, type PreviewItem } from './livePreview.ts'

/** A state for `doc` with the cursor at the `‸` marker (removed), or at the very end. */
function state(docWithCursor: string, extraCursors: number[] = []): EditorState {
  const at = docWithCursor.indexOf('‸')
  const doc = at === -1 ? docWithCursor : docWithCursor.slice(0, at) + docWithCursor.slice(at + 1)
  const cursor = at === -1 ? doc.length : at
  return EditorState.create({
    doc,
    selection: EditorSelection.create(
      [cursor, ...extraCursors].map((p) => EditorSelection.cursor(p)),
    ),
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      markdown({ base: markdownLanguage }),
    ],
  })
}

/** What the reader sees on a line: the text with hidden ranges removed and replacements shown. */
/** What the reader sees: hidden ranges removed, widgets shown as symbols (▦ for a table grid). */
function rendered(s: EditorState, items: PreviewItem[]): string {
  const symbol = (item: PreviewItem): string | undefined => {
    switch (item.kind) {
      case 'hide':
        return ''
      case 'bullet':
        return '•'
      case 'rule':
        return '———'
      case 'checkbox':
        return item.checked ? '☑' : '☐'
      case 'table':
        return '▦'
      default:
        return undefined
    }
  }
  let text = s.doc.toString()
  const edits = items
    .filter((i) => symbol(i) !== undefined && 'to' in i)
    .sort((a, b) => b.from - a.from)
  for (const item of edits) {
    if ('to' in item) text = text.slice(0, item.from) + (symbol(item) ?? '') + text.slice(item.to)
  }
  return text
}

const marks = (items: PreviewItem[], s: EditorState) =>
  items
    .filter((i) => i.kind === 'mark')
    .map((i) => `${i.className}:${s.doc.sliceString(i.from, i.to)}`)

const lineClasses = (items: PreviewItem[], s: EditorState) =>
  items
    .filter((i) => i.kind === 'line')
    .map((i) => `${String(s.doc.lineAt(i.from).number)}:${i.className}`)

describe('livePreview', () => {
  it('renders headings away from the cursor', () => {
    const s = state('## Objectives\n# Week 44\nnotes‸')

    const items = livePreview(s)

    expect(rendered(s, items)).toBe('Objectives\nWeek 44\nnotes')
    expect(lineClasses(items, s)).toEqual(['1:cm-h2', '2:cm-h1'])
  })

  it('keeps the syntax of the line being edited, but still styles it', () => {
    const s = state('## Objec‸tives\n# Week 44')

    const items = livePreview(s)

    expect(rendered(s, items)).toBe('## Objectives\nWeek 44')
    expect(lineClasses(items, s)).toEqual(['1:cm-h2', '2:cm-h1'])
  })

  it('renders every line when the editor is not focused', () => {
    const s = state('## Objec‸tives\n# Week 44')

    expect(rendered(s, livePreview(s, { focused: false }))).toBe('Objectives\nWeek 44')
  })

  it('renders bold, italic, strikethrough and inline code', () => {
    const s = state('**done** and _soon_ and ~~never~~ and `npm`\n‸')

    const items = livePreview(s)

    expect(rendered(s, items)).toBe('done and soon and never and npm\n')
    expect(marks(items, s)).toEqual([
      'cm-strong:**done**',
      'cm-em:_soon_',
      'cm-strike:~~never~~',
      'cm-code:`npm`',
    ])
  })

  it('shows only the text of links', () => {
    const s = state('See [the plan](https://example.com/plan) today\n‸')

    const items = livePreview(s)

    expect(rendered(s, items)).toBe('See the plan today\n')
    expect(marks(items, s)).toEqual(['cm-link:the plan'])
  })

  it('renders formatting inside link text', () => {
    const s = state('[**Ship** it](https://x.y)\n‸')

    expect(rendered(s, livePreview(s))).toBe('Ship it\n')
  })

  it('turns bullets into dots, but leaves numbers alone', () => {
    const s = state('- milk\n* eggs\n1. first\n‸')

    expect(rendered(s, livePreview(s))).toBe('• milk\n• eggs\n1. first\n')
  })

  it('turns to-dos into checkboxes and strikes done ones through', () => {
    const s = state('- [ ] call dentist\n- [x] buy milk\n‸')

    const items = livePreview(s)

    expect(rendered(s, items)).toBe('☐ call dentist\n☑ buy milk\n')
    expect(lineClasses(items, s)).toEqual(['2:cm-task-done'])
  })

  it('keeps a to-do’s list mark on the cursor line, but still shows its checkbox', () => {
    const s = state('- [ ] call ‸dentist')

    expect(rendered(s, livePreview(s))).toBe('- ☐ call dentist')
  })

  it('shows the brackets when the cursor is inside them', () => {
    const s = state('- [‸ ] call dentist')

    expect(rendered(s, livePreview(s))).toBe('- [ ] call dentist')
  })

  it('renders a table as a grid when the cursor is elsewhere', () => {
    const s = state('intro\n\n| Exercise | Mo |\n|---|---|\n| **Squat** | [x] |\n\nout‸')

    const items = livePreview(s)

    expect(rendered(s, items)).toBe('intro\n\n▦\n\nout')
    expect(items.filter((i) => i.kind === 'checkbox')).toEqual([])
  })

  it('shows a table as aligned text with checkboxes while the cursor is in it', () => {
    const s = state('| Exercise | Mo |\n|---|---|\n| **Squat**‸ | [x] |')

    const items = livePreview(s)

    expect(rendered(s, items)).toBe('| Exercise | Mo |\n|---|---|\n| **Squat** | ☑ |')
    expect(lineClasses(items, s)).toEqual(['1:cm-table-line', '2:cm-table-line', '3:cm-table-line'])
  })

  it('renders every table as a grid in an unfocused editor', () => {
    const s = state('| a |\n|---|\n| [‸ ] |')

    expect(rendered(s, livePreview(s, { focused: false }))).toBe('▦')
  })

  it('renders quotes and horizontal rules', () => {
    const s = state('> stay curious\n\n---\n‸')

    const items = livePreview(s)

    expect(rendered(s, items)).toBe('stay curious\n\n———\n')
    expect(lineClasses(items, s)).toEqual(['1:cm-quote'])
  })

  it('keeps every line with a cursor raw', () => {
    const doc = '# One\n# Two\n# Three'
    const s = state(`# One‸\n# Two\n# Three`, [doc.indexOf('Three')])

    expect(rendered(s, livePreview(s))).toBe('# One\nTwo\n# Three')
  })

  it('never hides overlapping ranges or anything on a line with a cursor', () => {
    const line = fc.constantFrom(
      '# Title',
      '## Sub',
      '**bold** text',
      '_it_ and `code`',
      '[link](http://x.y)',
      '- item',
      '> quote',
      '---',
      '- [ ] task',
      'plain words',
      '',
    )
    fc.assert(
      fc.property(fc.array(line, { minLength: 1, maxLength: 8 }), fc.nat(), (lines, seed) => {
        const doc = lines.join('\n')
        const s = state(doc, [])
        const cursor = seed % (doc.length + 1)
        const withCursor = s.update({ selection: EditorSelection.cursor(cursor) }).state
        const hidden = livePreview(withCursor)
          .filter((i) => i.kind !== 'line' && i.kind !== 'mark' && i.kind !== 'checkbox')
          .sort((a, b) => a.from - b.from)
        const cursorLine = withCursor.doc.lineAt(cursor)
        hidden.forEach((item, index) => {
          expect(item.from).toBeLessThan(item.to)
          if (index > 0) expect(item.from).toBeGreaterThanOrEqual(hidden[index - 1]?.to ?? 0)
          expect(item.to <= cursorLine.from || item.from > cursorLine.to).toBe(true)
        })
      }),
      { numRuns: 500 },
    )
  })
})
