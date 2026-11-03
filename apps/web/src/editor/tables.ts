import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'
import type { SyntaxNode, Tree } from '@lezer/common'

/** A cell of a markdown table row: its text (trimmed) and its range within the line. */
interface Cell {
  text: string
  /** Offset of the cell's content (between the pipes) within the line. */
  from: number
  to: number
}

/**
 * Splits a table row (`| a | b |`) into its cells. Escaped pipes (`\|`) stay inside a cell.
 * Leading and trailing pipes are optional, as in GitHub markdown.
 */
export function splitCells(line: string): Cell[] {
  const pipes: number[] = []
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '|' && line[i - 1] !== '\\') pipes.push(i)
  }
  // Cell boundaries: the pipes, plus the line edges where the outer pipes are left out.
  const bounds = [...pipes]
  if (!line.trimStart().startsWith('|')) bounds.unshift(-1)
  if (!line.trimEnd().endsWith('|') || pipes.length === 0) bounds.push(line.length)
  return bounds.slice(1).map((to, i) => {
    const from = (bounds[i] as number) + 1
    return { text: line.slice(from, to).trim(), from, to }
  })
}

const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
/** A table cell that is a checkbox: exactly `[ ]` or `[x]`. */
export const CHECKBOX_CELL = /^\[[ xX]\]$/

/** The whole page's syntax tree: parsing the rest (briefly) if only the visible part is parsed. */
export function fullTree(state: EditorState): Tree {
  return ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state)
}

type Align = 'none' | 'left' | 'center' | 'right'

interface FormattedTable {
  text: string
  /** Where each cell's content ended up (offsets in `text`), row by row; the delimiter row has none. */
  cells: { row: number; col: number; from: number; to: number }[]
}

/** Lays a table out with aligned columns, keeping alignment markers (`:--`, `:-:`, `--:`). */
export function formatTable(text: string): string {
  return formatRows(text.split('\n').map((line) => splitCells(line).map((c) => c.text))).text
}

/** Lays out a table given as rows of cell texts (the delimiter row as `---` cells). */
export function formatRows(rows: string[][]): FormattedTable {
  const delimiter = delimiterIndex(rows)
  const columns = Math.max(...rows.map((r) => r.length))
  const aligns: Align[] = Array.from({ length: columns }, (_, i) =>
    alignOf(rows[delimiter]?.[i] ?? ''),
  )
  const widths = Array.from({ length: columns }, (_, i) =>
    Math.max(3, ...rows.filter((_, r) => r !== delimiter).map((row) => (row[i] ?? '').length)),
  )

  const cells: FormattedTable['cells'] = []
  let offset = 0
  const lines = rows.map((row, r) => {
    let position = offset + 2
    const parts = widths.map((width, col) => {
      const align = aligns[col] ?? 'none'
      if (r === delimiter) {
        position += width + 3
        return dashes(align, width)
      }
      const content = row[col] ?? ''
      const padding = width - content.length
      const left = align === 'right' ? padding : align === 'center' ? Math.floor(padding / 2) : 0
      cells.push({ row: r, col, from: position + left, to: position + left + content.length })
      position += width + 3
      return ' '.repeat(left) + content + ' '.repeat(padding - left)
    })
    const line = `| ${parts.join(' | ')} |`
    offset += line.length + 1
    return line
  })
  return { text: lines.join('\n'), cells }
}

function delimiterIndex(rows: string[][]): number {
  return rows.findIndex((row) => row.length > 0 && DELIMITER_ROW.test(`|${row.join('|')}|`))
}

function alignOf(delimiterCell: string): Align {
  const left = delimiterCell.startsWith(':')
  const right = delimiterCell.endsWith(':')
  return left && right ? 'center' : left ? 'left' : right ? 'right' : 'none'
}

function dashes(align: Align, width: number): string {
  if (align === 'center') return `:${'-'.repeat(width - 2)}:`
  if (align === 'left') return `:${'-'.repeat(width - 1)}`
  if (align === 'right') return `${'-'.repeat(width - 1)}:`
  return '-'.repeat(width)
}

/** The table (its full text range) around `pos`, if any. */
export function findTable(
  state: EditorState,
  pos: number,
): { from: number; to: number } | undefined {
  const tree = fullTree(state)
  for (const side of [-1, 1] as const) {
    for (
      let node: SyntaxNode | null = tree.resolveInner(pos, side);
      node !== null;
      node = node.parent
    ) {
      if (node.name === 'Table') return { from: node.from, to: node.to }
    }
  }
  return undefined
}

interface TableContext {
  from: number
  to: number
  rows: string[][]
  delimiter: number
  /** The cursor's row and column. */
  row: number
  col: number
}

function tableContext(state: EditorState): TableContext | undefined {
  const head = state.selection.main.head
  const table = findTable(state, head)
  if (table === undefined) return undefined
  const lines = state.doc.sliceString(table.from, table.to).split('\n')
  const rows = lines.map((line) => splitCells(line).map((c) => c.text))
  const line = state.doc.lineAt(head)
  const row = line.number - state.doc.lineAt(table.from).number
  const cells = splitCells(line.text)
  const column = head - line.from
  const col = cells.findIndex((c) => column <= c.to)
  return {
    ...table,
    rows,
    delimiter: delimiterIndex(rows),
    row,
    // Past the last cell (after the closing pipe): the cursor is in the last cell.
    col: col === -1 ? Math.max(cells.length - 1, 0) : col,
  }
}

/** Replaces the table with `rows` laid out, putting the cursor at the end of a cell's content. */
function rewrite(
  context: TableContext,
  rows: string[][],
  target: { row: number; col: number },
): TransactionSpec {
  const formatted = formatRows(rows)
  const cell = formatted.cells.find((c) => c.row === target.row && c.col === target.col)
  return {
    changes: { from: context.from, to: context.to, insert: formatted.text },
    selection: EditorSelection.cursor(context.from + (cell?.to ?? 0)),
  }
}

/** A new row following `pattern`: a checkbox wherever the pattern has one, otherwise empty. */
function rowLike(pattern: string[], columns: number): string[] {
  return Array.from({ length: columns }, (_, i) =>
    CHECKBOX_CELL.test(pattern[i] ?? '') ? '[ ]' : '',
  )
}

/** Tab / Shift+Tab: aligns the table and moves to the next / previous cell; Tab past the end adds a row. */
export function moveToCell(state: EditorState, direction: 1 | -1): TransactionSpec | undefined {
  const context = tableContext(state)
  if (context === undefined) return undefined
  const columns = Math.max(...context.rows.map((r) => r.length))
  const rows = context.rows.map((row) => Array.from({ length: columns }, (_, i) => row[i] ?? ''))
  const order = rows.flatMap((_, r) =>
    r === context.delimiter ? [] : Array.from({ length: columns }, (_, col) => ({ row: r, col })),
  )
  const index = order.findIndex(
    (c) => c.row === context.row && c.col === Math.min(context.col, columns - 1),
  )
  const next = order[index + direction]
  if (next !== undefined) return rewrite(context, rows, next)
  if (direction === -1) return rewrite(context, rows, order[0] ?? { row: 0, col: 0 })
  rows.push(rowLike(rows[rows.length - 1] ?? [], columns))
  return rewrite(context, rows, { row: rows.length - 1, col: 0 })
}

/** Adds a row below the cursor's row (below the header when in the header). */
export function addRow(state: EditorState): TransactionSpec | undefined {
  const context = tableContext(state)
  if (context === undefined) return undefined
  const columns = Math.max(...context.rows.map((r) => r.length))
  const at = Math.max(context.row, context.delimiter) + 1
  const pattern =
    context.row <= context.delimiter
      ? (context.rows[context.delimiter + 1] ?? [])
      : (context.rows[context.row] ?? [])
  const rows = [...context.rows]
  rows.splice(at, 0, rowLike(pattern, columns))
  return rewrite(context, rows, { row: at, col: 0 })
}

/** Adds a column after the cursor's column, with checkboxes in rows where that column has one. */
export function addColumn(state: EditorState): TransactionSpec | undefined {
  const context = tableContext(state)
  if (context === undefined) return undefined
  const at = context.col + 1
  const rows = context.rows.map((row, r) => {
    const cell =
      r === context.delimiter ? '---' : CHECKBOX_CELL.test(row[context.col] ?? '') ? '[ ]' : ''
    return [...row.slice(0, at), cell, ...row.slice(at)]
  })
  return rewrite(context, rows, { row: 0, col: at })
}
