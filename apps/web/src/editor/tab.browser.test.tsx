import { EditorView } from '@codemirror/view'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { PageEditor } from './PageEditor.tsx'

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <button type="button">before</button>
      <PageEditor label="Week" value={value} onChange={setValue} />
      <button type="button">after</button>
      <output data-testid="value">{value}</output>
    </>
  )
}

const reported = () => page.getByTestId('value').element().textContent
const content = () => page.getByRole('textbox', { name: 'Week' }).element() as HTMLElement
const editorView = () => {
  const view = EditorView.findFromDOM(content())
  if (view === null) throw new Error('no editor')
  return view
}

async function focusAtEnd(initial: string) {
  await render(<Harness initial={initial} />)
  const view = editorView()
  view.focus()
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  return view
}

describe('Tab in a real browser', () => {
  it('nests a list item with Tab and un-nests it with Shift+Tab', async () => {
    await focusAtEnd('- a\n- b')

    await userEvent.keyboard('{Tab}')
    await expect.poll(reported).toBe('- a\n  - b')

    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await expect.poll(reported).toBe('- a\n- b')
    expect(document.activeElement).toBe(content())
  })

  it('does nothing on a plain line, and focus stays in the editor', async () => {
    await focusAtEnd('plain text')
    // A key the editor consumed is cancelled, so the browser does not move focus on.
    const cancelled: boolean[] = []
    document.addEventListener('keydown', (event) => cancelled.push(event.defaultPrevented))

    await userEvent.keyboard('{Tab}')
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')

    expect(cancelled.filter(Boolean)).toHaveLength(2)
    expect(reported()).toBe('plain text')
    expect(document.activeElement).toBe(content())
  })

  it('still moves between table cells', async () => {
    await focusAtEnd('| a | b |\n|---|---|\n| c | d |')
    editorView().dispatch({ selection: { anchor: 2 } })

    await userEvent.keyboard('{Tab}')

    await vi.waitFor(() => {
      const view = editorView()
      expect(view.state.doc.lineAt(view.state.selection.main.head).text).toBe('| a   | b   |')
      expect(view.state.selection.main.head).toBeGreaterThanOrEqual(8)
    })
    expect(document.activeElement).toBe(content())
  })

  it('lets Escape then Tab leave the editor, so keyboard users are not trapped', async () => {
    await focusAtEnd('- a\n- b')

    await userEvent.keyboard('{Escape}{Tab}')

    expect(reported()).toBe('- a\n- b')
    expect(content().contains(document.activeElement)).toBe(false)
  })
})
