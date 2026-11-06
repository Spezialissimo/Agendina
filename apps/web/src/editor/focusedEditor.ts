import type { EditorState, TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

let lastFocused: EditorView | undefined

/** Remembers the page editor the user last typed in, for commands run from the palette. */
export const rememberFocus = EditorView.domEventHandlers({
  focus(_event, view) {
    lastFocused = view
    return false
  },
})

/** The page editor that has focus, or else the one last used, if it is still on screen. */
export function focusedEditor(): EditorView | undefined {
  const content = document.activeElement?.closest('.cm-content')
  const focused = content instanceof HTMLElement ? EditorView.findFromDOM(content) : null
  return focused ?? (lastFocused?.dom.isConnected === true ? lastFocused : undefined)
}

/**
 * Runs an editor command on the page editor that has focus, or else on the one last used (e.g.
 * from the command palette, which takes focus away), and gives it focus. Returns whether it applied.
 */
export function applyToFocusedEditor(
  command: (state: EditorState) => TransactionSpec | undefined,
): boolean {
  const view = focusedEditor()
  const spec = view === undefined ? undefined : command(view.state)
  if (view === undefined || spec === undefined) return false
  view.dispatch(spec, { userEvent: 'input' })
  view.focus()
  return true
}
