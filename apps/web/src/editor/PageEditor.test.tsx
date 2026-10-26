import { EditorView } from '@codemirror/view'
import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { PageEditor } from './PageEditor.tsx'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A parent whose state catches up slowly, like React on a busy machine. */
function LaggingParent({ lag }: { lag: number }) {
  const [value, setValue] = useState('')
  return (
    <PageEditor
      label="Today"
      value={value}
      onChange={(next) => {
        setTimeout(() => {
          setValue(next)
        }, lag)
      }}
    />
  )
}

describe('PageEditor', () => {
  it('never loses or reorders keystrokes while the parent lags behind', async () => {
    render(<LaggingParent lag={25} />)
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Today' }))
    if (view === null) throw new Error('no editor')

    for (const char of 'the dentist') {
      act(() => {
        view.dispatch(view.state.replaceSelection(char), { userEvent: 'input.type' })
      })
      await act(() => sleep(10))
    }
    await act(() => sleep(100))

    expect(view.state.doc.toString()).toBe('the dentist')
  })
})
