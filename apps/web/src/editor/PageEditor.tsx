import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { Annotation, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { livePreviewExtension } from './livePreview.ts'
import { minimalChange } from './textChange.ts'

interface Props {
  /** Accessible name, e.g. the page title. */
  label: string
  value: string
  onChange: (value: string) => void
}

/** Marks changes that came from `value` (not from the user), so they are not reported back. */
const External = Annotation.define<boolean>()

/**
 * The editing surface of a page: CodeMirror 6 on the page's markdown (ADR 0004). The text is the
 * markdown exactly as stored. `data-editor` tells the shortcut handler that editor commands apply.
 */
export function PageEditor({ label, value, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | undefined>(undefined)
  const latestOnChange = useRef(onChange)

  useLayoutEffect(() => {
    latestOnChange.current = onChange
  }, [onChange])

  useEffect(() => {
    if (host.current === null) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ base: markdownLanguage }),
          livePreviewExtension,
          EditorView.lineWrapping,
          placeholder('Write here…'),
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
