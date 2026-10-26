import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { PageEditor } from './PageEditor.tsx'

function Harness({ initial, external }: { initial: string; external?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <PageEditor label="Today" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
      {external !== undefined && (
        <button
          type="button"
          onClick={() => {
            setValue(external)
          }}
        >
          sync
        </button>
      )}
    </>
  )
}

/** The value the editor last reported through onChange. */
const reported = () => page.getByTestId('value').element().textContent

const viewOf = (element: Element) => {
  const view = EditorView.findFromDOM(element as HTMLElement)
  if (view === null) throw new Error('no editor')
  return view
}

describe('PageEditor in a real browser', () => {
  it('is a labelled, multi-line text box that reports what you type', async () => {
    await render(<Harness initial="" />)
    const editor = page.getByRole('textbox', { name: 'Today' })

    await userEvent.click(editor)
    await userEvent.keyboard('Notes{Enter}more')

    await expect.poll(() => reported()).toBe('Notes\nmore')
    expect(editor.element().getAttribute('aria-multiline')).toBe('true')
  })

  it('continues a to-do list on Enter, and ends it on Enter in an empty item', async () => {
    await render(<Harness initial="" />)
    const editor = page.getByRole('textbox', { name: 'Today' })

    await userEvent.click(editor)
    // user-event reads "[" as the start of a key name; "[[" types a literal "[".
    await userEvent.keyboard('- [[ ] Finish report{Enter}Call dentist{Enter}{Enter}Notes')

    expect(viewOf(editor.element()).state.doc.toString()).toBe(
      '- [ ] Finish report\n- [ ] Call dentist\nNotes',
    )
  })

  it('takes in a new value from outside while keeping the cursor where you were typing', async () => {
    await render(<Harness initial={'first line\nsecond'} external={'FIRST LINE\nsecond'} />)
    const view = viewOf(page.getByRole('textbox', { name: 'Today' }).element())
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) })

    // Another device changed the first line while the cursor sat at the end.
    await page.getByRole('button', { name: 'sync' }).click()
    view.focus()
    await userEvent.keyboard('!')

    await expect.poll(() => reported()).toBe('FIRST LINE\nsecond!')
  })
})
