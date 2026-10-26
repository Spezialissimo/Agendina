import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addColumn, addRow, findTable, formatTable, moveToCell, splitCells } from './tables.ts'

describe('splitCells', () => {
  it.each([
    ['| Squat | [x] | [ ] |', ['Squat', '[x]', '[ ]']],
    ['Squat | [x]', ['Squat', '[x]']],
    ['| a \\| b | c |', ['a \\| b', 'c']],
    ['|  | x |', ['', 'x']],
  ])('splits %j', (line, cells) => {
    expect(splitCells(line).map((c) => c.text)).toEqual(cells)
  })

  it('gives ranges that point at each cell in the line', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z [\]x]{0,6}$/), { minLength: 1, maxLength: 6 }),
        (texts) => {
          const line = `| ${texts.join(' | ')} |`
          const cells = splitCells(line)
          expect(cells.map((c) => c.text)).toEqual(texts.map((t) => t.trim()))
          for (const cell of cells) expect(line.slice(cell.from, cell.to).trim()).toBe(cell.text)
        },
      ),
    )
  })
})

function state(docWithCursor: string): EditorState {
  const at = docWithCursor.indexOf('‸')
  const doc = at === -1 ? docWithCursor : docWithCursor.slice(0, at) + docWithCursor.slice(at + 1)
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(at === -1 ? 0 : at),
    extensions: [markdown({ base: markdownLanguage })],
  })
}

/** Applies a command and shows the result with the cursor as ‸. */
function after(s: EditorState, spec: TransactionSpec | undefined): string {
  if (spec === undefined) return 'unchanged'
  const next = s.update(spec).state
  const head = next.selection.main.head
  const doc = next.doc.toString()
  return doc.slice(0, head) + '‸' + doc.slice(head)
}

const lines = (...ls: string[]) => ls.join('\n')

describe('formatTable', () => {
  it('aligns the columns', () => {
    expect(
      formatTable(
        lines(
          '| Exercise | Mo | We |',
          '|---|---|---|',
          '| Squat | [x] | [ ] |',
          '| Deadlift | | [x] |',
        ),
      ),
    ).toBe(
      lines(
        '| Exercise | Mo  | We  |',
        '| -------- | --- | --- |',
        '| Squat    | [x] | [ ] |',
        '| Deadlift |     | [x] |',
      ),
    )
  })

  it('keeps column alignment markers and fills missing cells', () => {
    expect(formatTable(lines('| a | b | c |', '|:--|:-:|--:|', '| long text | x |'))).toBe(
      lines('| a         |  b  |   c |', '| :-------- | :-: | --: |', '| long text |  x  |     |'),
    )
  })

  it('is idempotent', () => {
    const once = formatTable(lines('|a|b|', '|-|-|', '|1|2|'))
    expect(formatTable(once)).toBe(once)
  })
})

describe('findTable', () => {
  it('finds the table around the cursor', () => {
    // In GitHub markdown a line right below a table is another row; a blank line ends the table.
    const s = state(lines('intro', '| a | b |', '|---|---|', '| 1 | 2‸ |', '', 'outro'))
    const table = findTable(s, s.selection.main.head)

    expect(table && s.doc.sliceString(table.from, table.to)).toBe(
      lines('| a | b |', '|---|---|', '| 1 | 2 |'),
    )
  })

  it('finds nothing outside tables', () => {
    const s = state(lines('intro‸', '| a | b |', '|---|---|'))
    expect(findTable(s, s.selection.main.head)).toBeUndefined()
  })
})

describe('moveToCell (Tab / Shift+Tab)', () => {
  const table = lines('| Exercise | Mo |', '|---|---|', '| Squat | [x] |')

  it('moves to the next cell, aligning the table', () => {
    const s = state(table.replace('| Exercise |', '| Exer‸cise |'))

    expect(after(s, moveToCell(s, 1))).toBe(
      lines('| Exercise | Mo‸  |', '| -------- | --- |', '| Squat    | [x] |'),
    )
  })

  it('skips the delimiter row', () => {
    const s = state(table.replace('| Mo |', '| Mo‸ |'))

    expect(after(s, moveToCell(s, 1))).toBe(
      lines('| Exercise | Mo  |', '| -------- | --- |', '| Squat‸    | [x] |'),
    )
  })

  it('moves back with Shift+Tab', () => {
    const s = state(table.replace('| Squat |', '| Squat‸ |'))

    expect(after(s, moveToCell(s, -1))).toBe(
      lines('| Exercise | Mo‸  |', '| -------- | --- |', '| Squat    | [x] |'),
    )
  })

  it('adds a row after the last cell, copying its checkboxes', () => {
    const s = state(table.replace('| [x] |', '| [x]‸ |'))

    expect(after(s, moveToCell(s, 1))).toBe(
      lines(
        '| Exercise | Mo  |',
        '| -------- | --- |',
        '| Squat    | [x] |',
        '| ‸         | [ ] |',
      ),
    )
  })

  it('leaves the text after the table alone', () => {
    const s = state(lines('| a | b |', '|---|---|', '| 1‸ | 2 |', '', 'notes below'))

    expect(after(s, moveToCell(s, 1))).toBe(
      lines('| a   | b   |', '| --- | --- |', '| 1   | 2‸   |', '', 'notes below'),
    )
  })

  it('does not apply outside tables', () => {
    const s = state('just text‸')
    expect(moveToCell(s, 1)).toBeUndefined()
  })
})

describe('addRow and addColumn', () => {
  const workout = lines(
    '| Exercise | Mo | We |',
    '|---|---|---|',
    '| Squat | [x] | [ ] |',
    '| Bench | [ ] | [ ] |',
  )

  it('adds a row below the cursor’s row, with checkboxes where that row has them', () => {
    const s = state(workout.replace('| Squat |', '| Squ‸at |'))

    expect(after(s, addRow(s))).toBe(
      lines(
        '| Exercise | Mo  | We  |',
        '| -------- | --- | --- |',
        '| Squat    | [x] | [ ] |',
        '| ‸         | [ ] | [ ] |',
        '| Bench    | [ ] | [ ] |',
      ),
    )
  })

  it('adds a column after the cursor’s column, with checkboxes where that column has them', () => {
    const s = state(workout.replace('| We |', '| W‸e |'))

    expect(after(s, addColumn(s))).toBe(
      lines(
        '| Exercise | Mo  | We  | ‸    |',
        '| -------- | --- | --- | --- |',
        '| Squat    | [x] | [ ] | [ ] |',
        '| Bench    | [ ] | [ ] | [ ] |',
      ),
    )
  })

  it('adds a plain column next to a text column', () => {
    const s = state(workout.replace('| Exercise |', '| Exer‸cise |'))

    expect(after(s, addColumn(s))).toBe(
      lines(
        '| Exercise | ‸    | Mo  | We  |',
        '| -------- | --- | --- | --- |',
        '| Squat    |     | [x] | [ ] |',
        '| Bench    |     | [ ] | [ ] |',
      ),
    )
  })
})
