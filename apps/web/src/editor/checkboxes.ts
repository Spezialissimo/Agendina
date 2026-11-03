import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state'
import { CHECKBOX_CELL, findTable, fullTree, splitCells } from './tables.ts'

export interface Checkbox {
  /** Range of the `[ ]` / `[x]` brackets. */
  from: number
  to: number
  checked: boolean
  /** A to-do's text, or "row, column" for a table cell. */
  label: string
  kind: 'task' | 'cell'
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])(\s+)/

/** Every checkbox in the page: to-dos (`- [ ] …`) and table cells that are exactly `[ ]`/`[x]`. */
export function findCheckboxes(state: EditorState): Checkbox[] {
  const tree = fullTree(state)
  const boxes: Checkbox[] = []
  tree.iterate({
    enter(ref) {
      const node = ref.node
      if (node.name === 'Task') {
        const marker = node.getChild('TaskMarker')
        if (marker === null) return false
        const checked = isChecked(state.doc.sliceString(marker.from, marker.to))
        // A line right below a list item continues it in markdown; the label is the to-do's line.
        const label = state.doc.sliceString(marker.to, state.doc.lineAt(marker.from).to).trim()
        boxes.push({ from: marker.from, to: marker.to, checked, label, kind: 'task' })
        return false
      }
      if (node.name === 'Table') {
        const header = node.getChild('TableHeader')
        const columns =
          header === null ? [] : splitCells(state.doc.lineAt(header.from).text).map((c) => c.text)
        for (const row of node.getChildren('TableRow')) {
          const line = state.doc.lineAt(row.from)
          for (const { offset, checked, label } of rowCheckboxes(line.text, columns)) {
            const from = line.from + offset
            boxes.push({ from, to: from + 3, checked, label, kind: 'cell' })
          }
        }
        return false
      }
      return undefined
    },
  })
  return boxes
}

/** Whether a `[ ]`/`[x]` box is checked. */
export function isChecked(box: string): boolean {
  return /^\[[xX]\]$/.test(box)
}

/** A table row's checkbox cells: column, where the box starts in the line, state and label. */
export function rowCheckboxes(
  line: string,
  header: string[],
): { col: number; offset: number; checked: boolean; label: string }[] {
  const cells = splitCells(line)
  const texts = cells.map((c) => c.text)
  return cells.flatMap((cell, col) =>
    CHECKBOX_CELL.test(cell.text)
      ? [
          {
            col,
            offset: line.indexOf('[', cell.from),
            checked: isChecked(cell.text),
            label: cellCheckboxLabel(texts, header, col),
          },
        ]
      : [],
  )
}

/**
 * "row, column" for a checkbox cell, e.g. "Chest press, Fatto": the row is named by its first
 * non-empty text cell, wherever the checkbox column is.
 */
function cellCheckboxLabel(cells: string[], header: string[], column: number): string {
  const row = cells.find((text) => text !== '' && !CHECKBOX_CELL.test(text)) ?? ''
  return `${row}, ${header[column] ?? ''}`
}

/** The change that checks or unchecks a box. */
export function toggleCheckbox(box: Pick<Checkbox, 'from' | 'checked'>): ChangeSpec {
  return { from: box.from + 1, to: box.from + 2, insert: box.checked ? ' ' : 'x' }
}

/**
 * ⌘↩ on the cursor's line: toggles its to-do (or the table cell box under the cursor); otherwise
 * makes the line a to-do. Returns undefined where it does not apply (elsewhere in a table).
 */
export function toggleAtCursor(state: EditorState): TransactionSpec | undefined {
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  const boxes = findCheckboxes(state)

  const box =
    boxes.find((b) => b.kind === 'cell' && b.from <= head && head <= b.to) ??
    boxes.find((b) => b.kind === 'task' && b.from >= line.from && b.to <= line.to)
  if (box !== undefined) return { changes: toggleCheckbox(box) }

  if (findTable(state, head) !== undefined) return undefined

  const item = LIST_ITEM.exec(line.text)
  const at =
    item === null
      ? line.from + (/^\s*/.exec(line.text)?.[0].length ?? 0)
      : line.from + item[0].length
  const insert = item === null ? '- [ ] ' : '[ ] '
  return {
    changes: { from: at, insert },
    selection: EditorSelection.cursor(head >= at ? head + insert.length : head),
  }
}
