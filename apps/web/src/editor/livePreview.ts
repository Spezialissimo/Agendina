import { syntaxTree } from '@codemirror/language'
import { type EditorState, type Range, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { findCheckboxes, isChecked, rowCheckboxes, toggleCheckbox } from './checkboxes.ts'
import { fullTree, splitCells } from './tables.ts'

/**
 * What live preview does to the markdown, as plain data (so it can be tested without a browser):
 * hide syntax, replace it with a widget, style a line, or style a range of text.
 */
export type PreviewItem =
  | { kind: 'hide'; from: number; to: number }
  | { kind: 'bullet'; from: number; to: number }
  | { kind: 'rule'; from: number; to: number }
  | { kind: 'line'; from: number; className: string }
  | { kind: 'mark'; from: number; to: number; className: string }
  | { kind: 'checkbox'; from: number; to: number; checked: boolean; label: string }
  | { kind: 'table'; from: number; to: number }

const INLINE: Record<string, { className: string; mark: string }> = {
  StrongEmphasis: { className: 'cm-strong', mark: 'EmphasisMark' },
  Emphasis: { className: 'cm-em', mark: 'EmphasisMark' },
  Strikethrough: { className: 'cm-strike', mark: 'StrikethroughMark' },
  InlineCode: { className: 'cm-code', mark: 'CodeMark' },
}

/**
 * Live preview of a page (ADR 0004): headings, emphasis, links, bullets, quotes and rules are
 * rendered; on every line holding a cursor (in a focused editor) the syntax stays visible so it
 * can be edited. To-dos and checkbox cells become checkboxes (raw only while the cursor is inside
 * their brackets; a to-do's `- ` shows only while the cursor touches it). Tables are grids, and
 * aligned text while the cursor is in them.
 */
export function livePreview(state: EditorState, { focused = true } = {}): PreviewItem[] {
  const tree = fullTree(state)
  const activeLines = new Set<number>()
  // An editor that is not focused still has a cursor position; only show syntax while typing.
  for (const range of focused ? state.selection.ranges : []) {
    for (
      let line = state.doc.lineAt(range.from).number;
      line <= state.doc.lineAt(range.to).number;
      line++
    ) {
      activeLines.add(line)
    }
  }
  const raw = (pos: number) => activeLines.has(state.doc.lineAt(pos).number)
  const items: PreviewItem[] = []
  /** Tables shown as grids: their checkboxes are drawn by the grid. */
  const grids: { from: number; to: number }[] = []
  /**
   * Hides a syntax mark, plus the space after it when there is one (`## `, `> `). Marks on a
   * cursor line stay raw, unless `evenWithCursor`.
   */
  const hide = (node: SyntaxNode, withSpace = false, evenWithCursor = false) => {
    if (!evenWithCursor && raw(node.from)) return
    const to =
      withSpace && state.doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
    items.push({ kind: 'hide', from: node.from, to })
  }

  tree.iterate({
    enter(ref) {
      const node = ref.node
      const heading = /^ATXHeading([1-6])$/.exec(node.name)
      if (heading !== null) {
        items.push({
          kind: 'line',
          from: state.doc.lineAt(node.from).from,
          className: `cm-h${heading[1] ?? '1'}`,
        })
        const mark = node.getChild('HeaderMark')
        if (mark !== null) hide(mark, true)
        return
      }
      const inline = INLINE[node.name]
      if (inline !== undefined) {
        items.push({ kind: 'mark', from: node.from, to: node.to, className: inline.className })
        for (const mark of node.getChildren(inline.mark)) hide(mark)
        return
      }
      switch (node.name) {
        case 'Table': {
          const editing =
            focused && state.selection.ranges.some((r) => r.to >= node.from && r.from <= node.to)
          if (!editing) {
            items.push({ kind: 'table', from: node.from, to: node.to })
            grids.push({ from: node.from, to: node.to })
          } else {
            // While editing, the table is aligned text: a monospace font keeps the columns straight.
            const first = state.doc.lineAt(node.from).number
            for (let line = first; line <= state.doc.lineAt(node.to).number; line++) {
              items.push({
                kind: 'line',
                from: state.doc.line(line).from,
                className: 'cm-table-line',
              })
            }
          }
          return false
        }
        case 'Link': {
          const marks = node.getChildren('LinkMark')
          const [open, close] = [marks[0], marks[1]]
          if (open === undefined || close === undefined || node.getChild('URL') === null) return
          items.push({ kind: 'mark', from: open.to, to: close.from, className: 'cm-link' })
          if (!raw(node.from)) {
            items.push({ kind: 'hide', from: open.from, to: open.to })
            items.push({ kind: 'hide', from: close.from, to: node.to })
          }
          // Children are still visited: link text can contain formatting.
          return
        }
        case 'ListItem': {
          const mark = node.getChild('ListMark')
          const task = node.getChild('Task')
          if (mark === null) return
          if (task !== null) {
            const marker = task.getChild('TaskMarker')
            // A bullet is hidden even on the cursor line (the checkbox says it is a to-do); shown
            // only while a cursor or selection is between the start of the line and the checkbox's
            // `]`. The number of an ordered to-do stays raw on the cursor line like any other mark.
            if (node.parent?.name !== 'BulletList') hide(mark, true)
            else {
              const touched =
                focused &&
                marker !== null &&
                state.selection.ranges.some(
                  (r) => r.to >= state.doc.lineAt(mark.from).from && r.from < marker.to,
                )
              if (!touched) hide(mark, true, true)
            }
            if (marker !== null && isChecked(state.doc.sliceString(marker.from, marker.to))) {
              items.push({
                kind: 'line',
                from: state.doc.lineAt(node.from).from,
                className: 'cm-task-done',
              })
            }
          } else if (node.parent?.name === 'BulletList' && !raw(mark.from)) {
            items.push({ kind: 'bullet', from: mark.from, to: mark.to })
          }
          return
        }
        case 'Blockquote': {
          for (
            let line = state.doc.lineAt(node.from).number;
            line <= state.doc.lineAt(node.to).number;
            line++
          ) {
            items.push({ kind: 'line', from: state.doc.line(line).from, className: 'cm-quote' })
          }
          return
        }
        case 'QuoteMark':
          hide(node, true)
          return
        case 'HorizontalRule':
          if (!raw(node.from)) items.push({ kind: 'rule', from: node.from, to: node.to })
          return
        default:
          return
      }
    },
  })
  for (const box of findCheckboxes(state)) {
    if (grids.some((grid) => box.from >= grid.from && box.to <= grid.to)) continue
    const editing =
      focused && state.selection.ranges.some((r) => r.from > box.from && r.to < box.to)
    if (!editing)
      items.push({
        kind: 'checkbox',
        from: box.from,
        to: box.to,
        checked: box.checked,
        label: box.label,
      })
  }
  return items
}

function checkboxInput(checked: boolean, label: string): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.className = 'cm-checkbox'
  input.checked = checked
  input.tabIndex = -1
  input.setAttribute('aria-label', label)
  return input
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly label: string,
  ) {
    super()
  }
  override eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.label === this.label
  }
  toDOM() {
    return checkboxInput(this.checked, this.label)
  }
  override ignoreEvent() {
    return false
  }
}

/** A table drawn as a grid; its checkbox cells stay clickable, and clicking a cell edits it. */
class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super()
  }
  override eq(other: TableWidget) {
    return other.source === this.source
  }
  toDOM() {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-table-widget'
    const table = document.createElement('table')
    const lines = this.source.split('\n')
    const header = splitCells(lines[0] ?? '').map((c) => c.text)
    let offset = 0
    lines.forEach((line, index) => {
      const lineOffset = offset
      offset += line.length + 1
      if (index === 1) return // the delimiter row
      const row = document.createElement('tr')
      const boxes = index === 0 ? [] : rowCheckboxes(line, header)
      splitCells(line).forEach((cell, col) => {
        const element = document.createElement(index === 0 ? 'th' : 'td')
        element.dataset.line = String(index)
        element.dataset.col = String(col)
        const box = boxes.find((b) => b.col === col)
        if (box !== undefined) {
          const input = checkboxInput(box.checked, box.label)
          input.dataset.offset = String(lineOffset + box.offset)
          element.append(input)
        } else {
          element.textContent = cell.text
        }
        row.append(element)
      })
      table.append(row)
    })
    wrapper.append(table)
    return wrapper
  }
  override ignoreEvent() {
    return false
  }
}

/** Clicks on checkboxes (inline or in a grid) and on grid cells. */
const clicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return false
    const grid = target.closest('.cm-table-widget')
    if (target instanceof HTMLInputElement && target.classList.contains('cm-checkbox')) {
      event.preventDefault()
      const at =
        grid === null ? view.posAtDOM(target) : view.posAtDOM(grid) + Number(target.dataset.offset)
      const box = findCheckboxes(view.state).find((b) => b.from === at)
      // The text is the truth: toggling it redraws the checkbox.
      if (box !== undefined)
        view.dispatch({ changes: toggleCheckbox(box), userEvent: 'input.toggle' })
      return true
    }
    const cell = target.closest('td, th')
    if (grid === null || !(cell instanceof HTMLElement)) return false
    // Put the cursor at the end of that cell's text: the table opens as editable text there.
    event.preventDefault()
    const first = view.state.doc.lineAt(view.posAtDOM(grid)).number
    const line = view.state.doc.line(first + Number(cell.dataset.line))
    const content = splitCells(line.text)[Number(cell.dataset.col)]
    const end =
      content === undefined
        ? line.to
        : line.from + content.from + line.text.slice(content.from, content.to).trimEnd().length
    view.focus()
    view.dispatch({ selection: { anchor: end } })
    return true
  },
  click(event) {
    if (
      event.target instanceof HTMLInputElement &&
      event.target.classList.contains('cm-checkbox')
    ) {
      event.preventDefault()
      return true
    }
    return false
  },
})

class BulletWidget extends WidgetType {
  override eq() {
    return true
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-bullet'
    span.textContent = '•'
    return span
  }
}

class RuleWidget extends WidgetType {
  override eq() {
    return true
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-rule'
    return span
  }
}

const setFocused = StateEffect.define<boolean>()

/** Whether the editor has focus, kept in the state so the preview can depend on it. */
const focusedField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setFocused)) return effect.value
    return value
  },
})

function decorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = livePreview(state, {
    focused: state.field(focusedField),
  }).map((item) => {
    switch (item.kind) {
      case 'hide':
        return Decoration.replace({}).range(item.from, item.to)
      case 'bullet':
        return Decoration.replace({ widget: new BulletWidget() }).range(item.from, item.to)
      case 'rule':
        return Decoration.replace({ widget: new RuleWidget() }).range(item.from, item.to)
      case 'line':
        return Decoration.line({ class: item.className }).range(item.from)
      case 'mark':
        return Decoration.mark({ class: item.className }).range(item.from, item.to)
      case 'checkbox':
        return Decoration.replace({ widget: new CheckboxWidget(item.checked, item.label) }).range(
          item.from,
          item.to,
        )
      case 'table':
        return Decoration.replace({
          widget: new TableWidget(state.doc.sliceString(item.from, item.to)),
          block: true,
        }).range(item.from, item.to)
    }
  })
  return Decoration.set(ranges, true)
}

const previewField = StateField.define<DecorationSet>({
  create: decorations,
  update(value, tr) {
    const reparsed = syntaxTree(tr.startState) !== syntaxTree(tr.state)
    const focusChanged = tr.effects.some((effect) => effect.is(setFocused))
    return tr.docChanged || tr.selection !== undefined || reparsed || focusChanged
      ? decorations(tr.state)
      : value
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** The CodeMirror extension: recomputes the preview when the text, cursor, parse or focus changes. */
export const livePreviewExtension = [
  focusedField,
  clicks,
  EditorView.focusChangeEffect.of((_state, focusing) => setFocused.of(focusing)),
  previewField,
]
