import type { EditorState, TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/** Runs an editor command on the page editor that has focus. Returns whether it applied. */
export function applyToFocusedEditor(
  command: (state: EditorState) => TransactionSpec | undefined,
): boolean {
  const content = document.activeElement?.closest('.cm-content')
  if (!(content instanceof HTMLElement)) return false
  const view = EditorView.findFromDOM(content)
  const spec = view === null ? undefined : command(view.state)
  if (view === null || spec === undefined) return false
  view.dispatch(spec, { userEvent: 'input' })
  return true
}
