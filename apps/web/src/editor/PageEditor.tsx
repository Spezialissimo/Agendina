import { ISO_WEEK, type WeekRule } from '@agendina/core'
import { autocompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { Annotation, EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { livePreviewExtension } from './livePreview.ts'
import { rememberFocus } from './focusedEditor.ts'
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
}

/** Applies an editor command if it applies here; false lets the key do its usual job. */
function apply(view: EditorView, spec: TransactionSpec | undefined): boolean {
  if (spec === undefined) return false
  view.dispatch(spec, { userEvent: 'input' })
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
export function PageEditor({ label, value, onChange, weekRule = ISO_WEEK }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | undefined>(undefined)
  const latestOnChange = useRef(onChange)
  const latestWeekRule = useRef(weekRule)

  useLayoutEffect(() => {
    latestOnChange.current = onChange
    latestWeekRule.current = weekRule
  }, [onChange, weekRule])

  useEffect(() => {
    if (host.current === null) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          // ⌘↩ is the app's "toggle to-do" command (see commands/registry.ts), not "insert blank line".
          keymap.of([
            // Tab moves between table cells; elsewhere it keeps moving keyboard focus.
            {
              key: 'Tab',
              run: (view) => apply(view, moveToCell(view.state, 1)),
              shift: (view) => apply(view, moveToCell(view.state, -1)),
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
            if (fromUser) latestOnChange.current(update.state.doc.toString())
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

  // Apply text coming from outside (merges, other devices) as a minimal change.
  useEffect(() => {
    const editor = view.current
    if (editor === undefined) return
    const change = minimalChange(editor.state.doc.toString(), value)
    if (change !== undefined) editor.dispatch({ changes: change, annotations: External.of(true) })
  }, [value])

  return <div ref={host} className="editor" data-editor="" />
}
