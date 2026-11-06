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
      <PageEditor label="Week" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  )
}

const WORKOUT =
  '## Training\n\n| Exercise | Mo | We |\n|---|---|---|\n| Squat | [x] | [ ] |\n\nnotes'
const reported = () => page.getByTestId('value').element().textContent
const grid = () => document.querySelector('.cm-table-widget table')
const editorView = () => {
  const view = EditorView.findFromDOM(
    page.getByRole('textbox', { name: 'Week' }).element() as HTMLElement,
  )
  if (view === null) throw new Error('no editor')
  return view
}

describe('tables in a real browser', () => {
  it('shows a table as a grid, with clickable checkbox cells', async () => {
    await render(<Harness initial={WORKOUT} />)

    await vi.waitFor(() => {
      expect(grid()).not.toBeNull()
    })
    expect([...(grid()?.querySelectorAll('th') ?? [])].map((th) => th.textContent)).toEqual([
      'Exercise',
      'Mo',
      'We',
    ])

    const we = document.querySelector('.cm-table-widget input[aria-label="Squat, We"]')
    if (we === null) throw new Error('no checkbox')
    await userEvent.click(page.elementLocator(we))

    await expect.poll(reported).toBe(WORKOUT.replace('| [x] | [ ] |', '| [x] | [x] |'))
  })

  it('opens a cell for editing when clicked, then Tab moves on and aligns the table', async () => {
    await render(<Harness initial={WORKOUT} />)
    await vi.waitFor(() => {
      expect(grid()).not.toBeNull()
    })

    const squat = [...document.querySelectorAll('.cm-table-widget td')].find(
      (td) => td.textContent === 'Squat',
    )
    if (squat === undefined) throw new Error('no cell')
    await userEvent.click(page.elementLocator(squat))

    await vi.waitFor(() => {
      expect(grid()).toBeNull()
    })
    const view = editorView()
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).toBe('| Squat | [x] | [ ] |')

    await userEvent.keyboard('s{Tab}')

    await expect
      .poll(reported)
      .toBe(
        '## Training\n\n| Exercise | Mo  | We  |\n| -------- | --- | --- |\n| Squats   | [x] | [ ] |\n\nnotes',
      )
  })

  it('makes checkbox cells clickable in any column, e.g. a "done" column first', async () => {
    const gym =
      '| Fatto | Esercizio |\n| ----- | --- |\n|[ ]| Chest press |\n|[X]| Shoulder press |'
    await render(<Harness initial={gym} />)

    const done = await vi.waitFor(() => {
      const box = document.querySelector('.cm-table-widget input[aria-label="Chest press, Fatto"]')
      if (box === null) throw new Error('no checkbox')
      return box
    })
    await userEvent.click(page.elementLocator(done))

    await expect.poll(reported).toBe(gym.replace('|[ ]| Chest press', '|[x]| Chest press'))
  })

  it('leaves the text alone when Tab is pressed outside the table, and focus stays in the editor', async () => {
    await render(<Harness initial={WORKOUT} />)
    const view = editorView()
    view.focus()
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    const cancelled: boolean[] = []
    document.addEventListener('keydown', (event) => cancelled.push(event.defaultPrevented))

    await userEvent.keyboard('{Tab}')

    expect(cancelled.filter(Boolean)).toHaveLength(1)
    expect(reported()).toBe(WORKOUT)
    expect(document.activeElement).toBe(view.contentDOM)
  })
})
