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
      <PageEditor label="Today" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  )
}

const reported = () => page.getByTestId('value').element().textContent

/**
 * A checkbox inside the editor, by its label, once it is drawn. Controls nested in the editor's
 * textbox are not exposed as separate accessible elements, so they are found by their aria-label.
 */
const checkbox = (label: string) =>
  vi.waitFor(() => {
    const element = document.querySelector(`input.cm-checkbox[aria-label="${label}"]`)
    if (element === null) throw new Error(`no checkbox "${label}"`)
    return page.elementLocator(element)
  })

describe('checkboxes in a real browser', () => {
  it('ticks and unticks a to-do by clicking it, without moving the cursor', async () => {
    await render(<Harness initial={'- [ ] Finish report\n- [ ] Call dentist\nnotes'} />)
    const view = EditorView.findFromDOM(
      page.getByRole('textbox', { name: 'Today' }).element() as HTMLElement,
    )
    if (view === null) throw new Error('no editor')
    view.dispatch({ selection: { anchor: view.state.doc.length } })

    await userEvent.click(await checkbox('Call dentist'))

    await expect.poll(reported).toBe('- [ ] Finish report\n- [x] Call dentist\nnotes')
    expect((await checkbox('Call dentist')).element()).toHaveProperty('checked', true)
    expect(view.state.selection.main.head).toBe(view.state.doc.length)

    await userEvent.click(await checkbox('Call dentist'))
    await expect.poll(reported).toBe('- [ ] Finish report\n- [ ] Call dentist\nnotes')
  })

  it('ticks a workout cell by row and column', async () => {
    await render(
      <Harness initial={'| Exercise | Mo | We |\n|---|---|---|\n| Squat | [ ] | [ ] |'} />,
    )

    await userEvent.click(await checkbox('Squat, We'))

    await expect.poll(reported).toBe('| Exercise | Mo | We |\n|---|---|---|\n| Squat | [ ] | [x] |')
  })
})
