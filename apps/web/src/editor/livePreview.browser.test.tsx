import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { PageEditor } from './PageEditor.tsx'

const lineTexts = (editor: Element) =>
  [...editor.querySelectorAll('.cm-line')].map((line) => line.textContent)

describe('live preview in a real browser', () => {
  it('renders markdown, showing the syntax only on the line being edited', async () => {
    await render(
      <PageEditor
        label="Today"
        value={'## Objectives\n- [**Ship**](https://x.y) it\nlast'}
        onChange={() => undefined}
      />,
    )
    const editor = page.getByRole('textbox', { name: 'Today' }).element()
    const view = EditorView.findFromDOM(editor as HTMLElement)
    if (view === null) throw new Error('no editor')

    // Not focused: everything is rendered, even the line holding the cursor.
    await expect.poll(() => lineTexts(editor)).toEqual(['Objectives', '• Ship it', 'last'])

    view.focus()
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) })
    await expect.poll(() => lineTexts(editor)).toEqual(['Objectives', '• Ship it', 'last'])
    expect(editor.querySelector('.cm-line.cm-h2')).not.toBeNull()

    view.dispatch({ selection: EditorSelection.cursor(3) })
    await expect.poll(() => lineTexts(editor)).toEqual(['## Objectives', '• Ship it', 'last'])
  })
})
