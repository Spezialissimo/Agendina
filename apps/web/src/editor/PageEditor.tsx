interface Props {
  /** Accessible name, e.g. the page title. */
  label: string
  value: string
  onChange: (value: string) => void
}

/**
 * The editing surface of a page. A plain text area for now; Phase 4 replaces it with the
 * CodeMirror live-preview editor behind this same interface. `data-editor` tells the shortcut
 * handler that editor-context commands apply here.
 */
export function PageEditor({ label, value, onChange }: Props) {
  return (
    <textarea
      className="editor"
      data-editor=""
      aria-label={label}
      value={value}
      spellCheck
      onChange={(event) => {
        onChange(event.target.value)
      }}
    />
  )
}
