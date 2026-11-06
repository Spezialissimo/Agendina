import type { ChangeSpec, EditorState, TransactionSpec } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import { fullTree } from './tables.ts'

const TAB_SIZE = 4

/** The column `text` ends at, with tabs expanded to the next multiple of 4 (CommonMark). */
function columns(text: string): number {
  let col = 0
  for (const char of text) col = char === '\t' ? col + TAB_SIZE - (col % TAB_SIZE) : col + 1
  return col
}

/** A list item that starts its line (not inside a quote), as the syntax tree sees it. */
function startsLine(state: EditorState, item: SyntaxNode): boolean {
  const line = state.doc.lineAt(item.from)
  return state.doc.sliceString(line.from, item.from).trim() === ''
}

function markerColumn(state: EditorState, item: SyntaxNode): number {
  const line = state.doc.lineAt(item.from)
  return columns(state.doc.sliceString(line.from, item.from))
}

/** The column where the item's text starts: what a child has to be indented to nest under it. */
function contentColumn(state: EditorState, item: SyntaxNode): number {
  const line = state.doc.lineAt(item.from)
  const mark = item.getChild('ListMark')
  if (mark === null) return markerColumn(state, item)
  const spaces = /^[ \t]*/.exec(state.doc.sliceString(mark.to, line.to))?.[0] ?? ''
  const text = columns(state.doc.sliceString(line.from, mark.to + spaces.length))
  // A bare marker has no text yet: a child still has to start past the marker and one space.
  return spaces === '' ? text + 1 : text
}

function enclosingItem(item: SyntaxNode): SyntaxNode | null {
  for (let node = item.parent; node !== null; node = node.parent) {
    if (node.name === 'ListItem') return node
  }
  return null
}

/** How far the item moves: under the previous sibling in its list, or out to its parent's level. */
function shift(state: EditorState, item: SyntaxNode, direction: 1 | -1): number {
  if (direction === 1) {
    const sibling = item.prevSibling
    if (sibling === null || sibling.name !== 'ListItem') return 0
    return Math.max(0, contentColumn(state, sibling) - markerColumn(state, item))
  }
  const parent = enclosingItem(item)
  if (parent === null || !startsLine(state, parent)) return 0
  return Math.min(0, markerColumn(state, parent) - markerColumn(state, item))
}

/**
 * Tab / Shift+Tab on list items and to-dos: nests an item under the previous item of its list
 * (indented to that item's text, which is what CommonMark needs: 2 for `- `, 3 for `1. `) or moves
 * it back out to its parent's level. The item's children and continuation lines move with it, so
 * the structure below it is kept; a selected item moves together with its selected children. Only
 * leading whitespace changes.
 */
export function nestListItems(state: EditorState, direction: 1 | -1): TransactionSpec | undefined {
  const lineNumbers = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from)
    let last = state.doc.lineAt(range.to)
    // As CodeMirror's own line commands: a selection ending at a line's start excludes that line.
    if (!range.empty && range.to === last.from && last.number > first.number) {
      last = state.doc.line(last.number - 1)
    }
    for (let n = first.number; n <= last.number; n++) lineNumbers.add(n)
  }

  // The innermost item on each selected line: its first line, or one of its continuation lines.
  const tree = fullTree(state)
  const found = new Map<number, SyntaxNode>()
  for (const n of lineNumbers) {
    const line = state.doc.line(n)
    const indent = /^[ \t]*/.exec(line.text)?.[0].length ?? 0
    if (indent === line.text.length) continue
    for (let node: SyntaxNode | null = tree.resolveInner(line.from + indent, 1); node !== null;) {
      if (node.name === 'ListItem') {
        found.set(node.from, node)
        break
      }
      node = node.parent
    }
  }
  const selected = [...found.values()].sort((x, y) => x.from - y.from)

  // Parents come first. A selected child is carried along only by a selected ancestor that moves.
  const moved = new Set<number>()
  const delta = new Map<number, number>()
  for (const item of selected) {
    let carried = false
    for (let node = enclosingItem(item); node !== null; node = enclosingItem(node)) {
      if (moved.has(node.from)) carried = true
    }
    if (carried || !startsLine(state, item)) continue
    const by = shift(state, item, direction)
    if (by === 0) continue
    moved.add(item.from)
    const last = state.doc.lineAt(item.to).number
    for (let n = state.doc.lineAt(item.from).number; n <= last; n++) {
      if (!delta.has(n)) delta.set(n, by)
    }
  }

  const changes: ChangeSpec[] = []
  for (const [n, by] of delta) {
    const line = state.doc.line(n)
    if (line.text.trim() === '') continue
    const indent = /^[ \t]*/.exec(line.text)?.[0] ?? ''
    const width = columns(indent)
    const target = Math.max(0, width + by)
    if (target === width) continue
    if (indent.includes('\t')) {
      // Keep the tabs the user typed where possible: add or take away spaces after them.
      const spaces = /[ ]*$/.exec(indent)?.[0].length ?? 0
      const end = line.from + indent.length
      if (by > 0) changes.push({ from: end, insert: ' '.repeat(by) })
      else if (spaces >= -by) changes.push({ from: end + by, to: end })
      else changes.push({ from: line.from, to: end, insert: ' '.repeat(target) })
    } else if (by > 0) {
      changes.push({ from: line.from, insert: ' '.repeat(by) })
    } else {
      changes.push({ from: line.from, to: line.from + width - target })
    }
  }
  if (changes.length === 0) return undefined
  const set = state.changes(changes)
  // assoc 1: a cursor at the start of a line ends up after the indent, where typing belongs.
  return { changes: set, selection: state.selection.map(set, 1) }
}
