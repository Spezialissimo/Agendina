import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { PageEditor } from './PageEditor.tsx'

function Harness() {
  const [value, setValue] = useState('')
  return (
    <>
      <PageEditor label="Today" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  )
}

const reported = () => page.getByTestId('value').element().textContent
const menuOptions = () =>
  [
    ...document.querySelectorAll('.cm-tooltip-autocomplete [role="option"] .cm-completionLabel'),
  ].map((option) => option.textContent)

describe('slash menu in a real browser', () => {
  it('opens on "/", filters as you type, and inserts the chosen block', async () => {
    await render(<Harness />)
    await userEvent.click(page.getByRole('textbox', { name: 'Today' }))

    await userEvent.keyboard('/')
    await expect.poll(() => menuOptions()).toContain('Heading 1')

    await userEvent.keyboard('todo')
    await expect
      .poll(() => document.querySelectorAll('.cm-tooltip-autocomplete [role="option"]').length)
      .toBe(1)
    // CodeMirror ignores Enter for 75 ms after the menu changes, so fast typing cannot pick by accident.
    await new Promise((resolve) => setTimeout(resolve, 100))
    await userEvent.keyboard('{Enter}call dentist')

    await expect.poll(reported).toBe('- [ ] call dentist')
  })

  it('closes with Escape and keeps the "/"', async () => {
    await render(<Harness />)
    await userEvent.click(page.getByRole('textbox', { name: 'Today' }))

    await userEvent.keyboard('/')
    await expect.poll(() => menuOptions()).toContain('To-do')
    await userEvent.keyboard('{Escape}')

    await expect.poll(() => document.querySelector('.cm-tooltip-autocomplete')).toBeNull()
    expect(reported()).toBe('/')
  })
})
