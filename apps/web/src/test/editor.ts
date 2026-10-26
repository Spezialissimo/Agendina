import { EditorView } from '@codemirror/view'
import { act } from '@testing-library/react'

/**
 * Drives the real CodeMirror editor in jsdom through its own API. jsdom cannot emulate typing into
 * a contenteditable reliably, so app tests change the text the way CodeMirror reports user input;
 * real key presses are covered by the browser tests (*.browser.test.tsx) and the e2e journeys.
 */
function view(editor: HTMLElement): EditorView {
  const found = EditorView.findFromDOM(editor)
  if (found === null) throw new Error('Not a CodeMirror editor')
  return found
}

export function editorText(editor: HTMLElement): string {
  return view(editor).state.doc.toString()
}

/** Types `text` at the end, like a user would. */
export function typeInto(editor: HTMLElement, text: string): void {
  const v = view(editor)
  act(() => {
    v.dispatch({ changes: { from: v.state.doc.length, insert: text }, userEvent: 'input.type' })
  })
}

/** Selects everything and types `text` over it. */
export function replaceText(editor: HTMLElement, text: string): void {
  const v = view(editor)
  act(() => {
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: text },
      userEvent: 'input.type',
    })
  })
}
