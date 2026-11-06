import { ISO_WEEK, type WeekRule } from '@agendina/core'
import { autocompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { Annotation, EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { livePreviewExtension } from './livePreview.ts'
import { focusAfterNavigation, rememberFocus } from './focusedEditor.ts'
import { nestListItems } from './lists.ts'
import { slashSource } from './slashMenu.ts'
import { moveToCell } from './tables.ts'
import { minimalChange } from './textChange.ts'

interface Props {
  /** Accessible name, e.g. the page title. */
  label: string
  value: string
  onChange: (value: string) => void
  /** For the slash menu's week tracker; ISO weeks if not given. */
  weekRule?: WeekRule
  /** The cursor and selection to start with; the start of the text if not given. */
  initialSelection?: { anchor: number; head: number }
  /** Called when the user moves the cursor or edits, while the editor has focus. */
  onSelectionChange?: (selection: { anchor: number; head: number }) => void
  /** Takes keyboard focus when given a new request id, then calls `done`. */
  focusRequest?: { id: number; done: () => void } | undefined
}

/** Applies an editor command if it applies here; false lets the key do its usual job. */
function apply(view: EditorView, spec: TransactionSpec | undefined): boolean {
  if (spec === undefined) return false
  view.dispatch(spec, { userEvent: 'input' })
  return true
}

/** Always consumes the key, so focus never leaves the editor by accident. */
function tab(view: EditorView, direction: 1 | -1): boolean {
  apply(view, moveToCell(view.state, direction) ?? nestListItems(view.state, direction))
  return true
}

/** The slash menu in the paper style (a CodeMirror theme, so it wins over the default theme). */
const menuTheme = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    background: 'var(--page)',
    border: 'none',
    borderRadius: '8px',
    boxShadow: 'var(--shadow)',
    padding: '0.25rem',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-body)',
    maxHeight: '18rem',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1.5rem',
    padding: '0.35rem 0.6rem',
    borderRadius: '6px',
    color: 'var(--ink)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    background: 'var(--rule)',
    color: 'var(--ink)',
  },
  '.cm-completionDetail': {
    fontFamily: 'var(--font-mono)',
    fontStyle: 'normal',
    fontSize: '0.8em',
    color: 'var(--ink-soft)',
  },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '600' },
})

/** Marks changes that came from `value` (not from the user), so they are not reported back. */
const External = Annotation.define<boolean>()

/**
 * The editing surface of a page: CodeMirror 6 on the page's markdown (ADR 0004). The text is the
 * markdown exactly as stored. `data-editor` tells the shortcut handler that editor commands apply.
 */
export function PageEditor({
  label,
  value,
  onChange,
  weekRule = ISO_WEEK,
  initialSelection,
  onSelectionChange,
  focusRequest,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | undefined>(undefined)
  const latestOnChange = useRef(onChange)
  const latestWeekRule = useRef(weekRule)
  const latestOnSelectionChange = useRef(onSelectionChange)
  const latestFocusRequest = useRef(focusRequest)
  /** Texts reported through onChange since the parent last caught up with the editor. */
  const reported = useRef(new Set<string>())

  useLayoutEffect(() => {
    latestOnChange.current = onChange
    latestWeekRule.current = weekRule
    latestOnSelectionChange.current = onSelectionChange
    latestFocusRequest.current = focusRequest
  }, [onChange, weekRule, onSelectionChange, focusRequest])

  useEffect(() => {
    if (host.current === null) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        ...(initialSelection === undefined ? {} : { selection: initialSelection }),
        extensions: [
          history(),
          keymap.of([
            // Tab moves between table cells, nests list items, and elsewhere does nothing but stays
            // in the editor. Esc then Tab still leaves it (CodeMirror checks that before keymaps);
            // with the slash menu open, the first Esc only closes the menu: Esc, Esc, Tab.
            {
              key: 'Tab',
              run: (view) => tab(view, 1),
              shift: (view) => tab(view, -1),
            },
            // ⌘↩ is the app's "toggle to-do" command (see commands/registry.ts), not "insert blank line".
            ...defaultKeymap.filter((binding) => binding.key !== 'Mod-Enter'),
            ...historyKeymap,
          ]),
          rememberFocus,
          markdown({ base: markdownLanguage }),
          livePreviewExtension,
          EditorView.lineWrapping,
          placeholder('Write here…'),
          autocompletion({ override: [slashSource(() => latestWeekRule.current)], icons: false }),
          menuTheme,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            const fromUser = update.transactions.some(
              (t) => t.annotation(External) !== true && t.docChanged,
            )
            if (fromUser) {
              const text = update.state.doc.toString()
              reported.current.add(text)
              latestOnChange.current(text)
            }
            if ((update.selectionSet || update.docChanged) && update.view.hasFocus) {
              const { anchor, head } = update.state.selection.main
              latestOnSelectionChange.current?.({ anchor, head })
            }
          }),
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = undefined
    }
    // The editor is created once per page; `value` updates are applied below, `label` is fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply text coming from outside (merges, other devices) as a minimal change. A `value` the
  // editor itself reported is only the parent catching up, possibly with an older text while the
  // user has typed on: applying it would delete the newest keystrokes and move the cursor.
  useEffect(() => {
    const editor = view.current
    if (editor === undefined) return
    const current = editor.state.doc.toString()
    if (value === current) {
      reported.current.clear()
      return
    }
    if (reported.current.has(value)) return
    reported.current.clear()
    const change = minimalChange(current, value)
    if (change !== undefined) editor.dispatch({ changes: change, annotations: External.of(true) })
  }, [value])

  // After the editor is created (effects run in order), so a page that just loaded takes focus.
  const focusRequestId = focusRequest?.id
  useEffect(() => {
    if (focusRequestId === undefined || view.current === undefined) return
    focusAfterNavigation(view.current)
    latestFocusRequest.current?.done()
  }, [focusRequestId])

  return <div ref={host} className="editor" data-editor="" />
}
