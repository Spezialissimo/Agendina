import type { EditorState, TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

let lastFocused: EditorView | undefined
/** The editor a navigation put the cursor in, until the user types or clicks in it. */
let placedByNavigation: EditorView | undefined
let focusingAfterNavigation = false

const engage = (view: EditorView) => {
  if (placedByNavigation === view) placedByNavigation = undefined
  return false
}

/**
 * Remembers the page editor the user last typed in, for commands run from the palette, and
 * whether they have started working in a page a navigation focused.
 */
export const rememberFocus = EditorView.domEventHandlers({
  focus(_event, view) {
    lastFocused = view
    return focusingAfterNavigation ? false : engage(view)
  },
  keydown: (_event, view) => engage(view),
  pointerdown: (_event, view) => engage(view),
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

/**
 * Gives `view` keyboard focus because the user navigated to its page (planner/pageFocus.ts), which
 * is not the user moving into the page: focus mode waits for them to type or click in it. Also
 * shows the cursor: CodeMirror focuses without scrolling, and the page around it scrolls.
 */
export function focusAfterNavigation(view: EditorView): void {
  placedByNavigation = view
  focusingAfterNavigation = true
  try {
    view.focus()
  } finally {
    focusingAfterNavigation = false
  }
  view.dispatch({
    effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'nearest' }),
  })
}

/** Whether the focus event being handled comes from `focusAfterNavigation`. */
export const isFocusAfterNavigation = () => focusingAfterNavigation

/**
 * Whether `element` is in the editor a navigation put the cursor in, and the user has not typed or
 * clicked in it since: their hand may still be on the mouse.
 */
export function awaitsUser(element: Element | null): boolean {
  const content = element?.closest('.cm-content')
  return (
    placedByNavigation !== undefined &&
    content instanceof HTMLElement &&
    EditorView.findFromDOM(content) === placedByNavigation
  )
}
