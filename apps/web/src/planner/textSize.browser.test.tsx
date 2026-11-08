import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { PageEditor } from '../editor/PageEditor.tsx'
import '../styles.css'

/**
 * The real stylesheet and the real editor, in the markup NotePage produces. The whole app needs a
 * server, which browser mode does not have; what is checked here is only the CSS, which jsdom
 * cannot compute.
 */
function Pages({ size }: { size: 'small' | 'medium' | 'large' }) {
  return (
    <>
      <nav className="week-strip" aria-label="Week">
        <span>Week 44</span>
      </nav>
      <section className="page" data-editable data-text-size={size} aria-label="Editable">
        <header className="page-header">
          <h2>Monday</h2>
          <p className="page-subtitle">October 26</p>
        </header>
        <PageEditor
          label="Editable page"
          value={'# Heading\n\nfirst line\nsecond line\nthird line'}
          onChange={() => undefined}
          weekRule={{ firstDay: 1, minimalDays: 4 }}
        />
      </section>
      <section className="page" data-text-size={size} aria-label="Neighbour">
        <header className="page-header">
          <h2>Tuesday</h2>
        </header>
        <div className="page-content">Read only</div>
      </section>
    </>
  )
}

const px = (selector: string) => {
  const element = document.querySelector(selector)
  if (element === null) throw new Error(`no ${selector}`)
  return Number.parseFloat(getComputedStyle(element).fontSize)
}

describe('text size styles in a real browser', () => {
  it.each([
    ['small', 0.875],
    ['medium', 1],
    ['large', 1.25],
  ] as const)('scales the page text and titles at %s, and nothing else', async (size, scale) => {
    await render(<Pages size={size} />)

    expect(px('.page[data-editable] .cm-content')).toBeCloseTo(16 * scale)
    expect(px('.page[data-editable] h2')).toBeCloseTo(24 * scale)
    expect(px('.page[data-editable] .page-subtitle')).toBeCloseTo(14 * scale)
    expect(px('.page:not([data-editable]) .page-content')).toBeCloseTo(16 * scale)
    expect(px('.page:not([data-editable]) h2')).toBeCloseTo(24 * scale)
    // Outside the pages nothing changes.
    expect(px('.week-strip')).toBe(16)
  })

  it('scales headings with the text', async () => {
    await render(<Pages size="large" />)

    expect(px('.page[data-editable] .cm-h1')).toBeCloseTo(16 * 1.25 * 1.6)
  })

  it('puts the cursor on the clicked line after the size changed', async () => {
    const screen = await render(<Pages size="medium" />)
    await screen.rerender(<Pages size="large" />)

    const line = [...document.querySelectorAll('.cm-line')].find(
      (l) => l.textContent === 'third line',
    )
    if (line === undefined) throw new Error('no line')
    await userEvent.click(line)

    const content = document.querySelector('.cm-content')
    if (!(content instanceof HTMLElement)) throw new Error('no editor')
    const view = EditorView.findFromDOM(content)
    if (view === null) throw new Error('no view')
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).toBe('third line')
  })
})
