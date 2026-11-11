import type { NoteKind } from '@agendina/contract'
import type { DayKey } from '@agendina/core'
import { completionStatus } from '@codemirror/autocomplete'
import { EditorView } from '@codemirror/view'
import type { KeyboardEvent } from 'react'
import { TemplateEditor } from './TemplateEditor.tsx'
import { useTemplate } from './useTemplate.ts'

/**
 * The template editor in a pop-up over the pages, which stay where they are meanwhile: no
 * navigation, no shortcuts. Escape closes it without saving, like Cancel.
 */
export function TemplateDialog({
  kind,
  from,
  onClose,
}: {
  kind: NoteKind
  /** The selected page of `kind` (its view key): the change is applied from it by default. */
  from: DayKey
  onClose: () => void
}) {
  const template = useTemplate(kind)
  const label = `${kind === 'day' ? 'Day' : 'Week'} template`

  // In the editor, decided before CodeMirror sees the key: by then a slash menu is closed.
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !inEditor(event.target) || slashMenuOpen(event.target)) return
    event.preventDefault()
    onClose()
  }
  // Elsewhere, left alone when something inside used the key, e.g. the save button's calendar.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || inEditor(event.target) || event.defaultPrevented) return
    event.preventDefault()
    onClose()
  }

  return (
    <div className="palette-backdrop dialog-backdrop">
      <div
        className="template-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDownCapture={onKeyDownCapture}
        onKeyDown={onKeyDown}
      >
        {template.data !== undefined && (
          <TemplateEditor kind={kind} template={template.data} from={from} onClose={onClose} />
        )}
        {template.isError && template.data === undefined && (
          <>
            <p role="alert">
              The template could not be loaded. Check your connection and try again.
            </p>
            <div className="conflict-actions">
              <button
                type="button"
                className="link"
                onClick={() => {
                  onClose()
                }}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function inEditor(target: EventTarget): boolean {
  return target instanceof Element && target.closest('.cm-editor') !== null
}

/**
 * Whether Escape is for the editor's slash menu, which it closes. Not CodeMirror's own verdict
 * (the event's defaultPrevented), which comes too late and also takes the key while a query just
 * typed is pending, with no menu on screen.
 */
function slashMenuOpen(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false
  const view = EditorView.findFromDOM(target)
  return view !== null && completionStatus(view.state) === 'active'
}
