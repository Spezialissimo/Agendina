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

/**
 * Runs an editor command on the page editor that has focus, or else on the one last used (e.g.
 * from the command palette, which takes focus away), and gives it focus. Returns whether it applied.
 */
export function applyToFocusedEditor(
  command: (state: EditorState) => TransactionSpec | undefined,
): boolean {
  const content = document.activeElement?.closest('.cm-content')
  const focused = content instanceof HTMLElement ? EditorView.findFromDOM(content) : null
  const view = focused ?? (lastFocused?.dom.isConnected === true ? lastFocused : undefined)
  const spec = view === undefined ? undefined : command(view.state)
  if (view === undefined || spec === undefined) return false
  view.dispatch(spec, { userEvent: 'input' })
  view.focus()
  return true
}
