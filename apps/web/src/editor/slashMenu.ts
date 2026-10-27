import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { EditorSelection, type TransactionSpec } from '@codemirror/state'
import type { WeekRule } from '@agendina/core'
import { formatRows } from './tables.ts'

export interface SlashItem {
  label: string
  detail: string
  /** The text to insert, and where the cursor goes in it. */
  build: (rule: WeekRule) => { text: string; cursor: number }
}

const prefix = (text: string) => () => ({ text, cursor: text.length })

/** A laid-out table with the cursor in the given cell (by default the first header cell). */
function table(rows: string[][], target = { row: 0, col: 0 }) {
  const formatted = formatRows(rows)
  const cell = formatted.cells.find((c) => c.row === target.row && c.col === target.col)
  return { text: formatted.text, cursor: cell?.from ?? 0 }
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** In menu order: the most used first. */
export const SLASH_ITEMS: SlashItem[] = [
  { label: 'To-do', detail: '- [ ]', build: prefix('- [ ] ') },
  { label: 'Heading 1', detail: '#', build: prefix('# ') },
  { label: 'Heading 2', detail: '##', build: prefix('## ') },
  { label: 'Heading 3', detail: '###', build: prefix('### ') },
  { label: 'Bullet list', detail: '-', build: prefix('- ') },
  { label: 'Numbered list', detail: '1.', build: prefix('1. ') },
  {
    label: 'Week tracker',
    detail: 'a checkbox per day',
    build: (rule) => {
      const days = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(rule.firstDay - 1 + i) % 7] ?? '')
      // The cursor goes where the first habit or exercise is named.
      return table(
        [['', ...days], Array<string>(8).fill('---'), ['', ...Array<string>(7).fill('[ ]')]],
        { row: 2, col: 0 },
      )
    },
  },
  {
    label: 'Table',
    detail: '2 × 2',
    build: () =>
      table([
        ['', ''],
        ['---', '---'],
        ['', ''],
      ]),
  },
  { label: 'Quote', detail: '>', build: prefix('> ') },
  { label: 'Divider', detail: '---', build: prefix('---\n') },
  { label: 'Code block', detail: '```', build: () => ({ text: '```\n\n```', cursor: 4 }) },
]

/** Replaces the `/query` (from `slashFrom`, the "/", to `to`) with the item. */
export function slashEdit(
  item: SlashItem,
  rule: WeekRule,
  slashFrom: number,
  to: number,
): TransactionSpec {
  const { text, cursor } = item.build(rule)
  return {
    changes: { from: slashFrom, to, insert: text },
    selection: EditorSelection.cursor(slashFrom + cursor),
  }
}

/**
 * The completion source: "/" at the start of a line (after indentation) opens the menu; not after
 * other text, so "and/or" or "26/10" stay plain.
 */
export function slashSource(weekRule: WeekRule | (() => WeekRule)) {
  return (context: CompletionContext): CompletionResult | null => {
    const rule = typeof weekRule === 'function' ? weekRule() : weekRule
    const line = context.state.doc.lineAt(context.pos)
    const match = /^(\s*)\/(\w*)$/.exec(line.text.slice(0, context.pos - line.from))
    if (match === null) return null
    const from = line.from + (match[1]?.length ?? 0) + 1
    return {
      from,
      validFor: /^\w*$/,
      options: SLASH_ITEMS.map((item, index) => ({
        label: item.label,
        detail: item.detail,
        // Keeps the menu order; CodeMirror would otherwise sort equal matches alphabetically.
        boost: SLASH_ITEMS.length - index,
        apply: (view, _completion, start, end) => {
          view.dispatch(slashEdit(item, rule, start - 1, end), { userEvent: 'input.complete' })
        },
      })),
    }
  }
}
