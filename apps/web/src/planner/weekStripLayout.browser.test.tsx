import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import type { ReactNode } from 'react'
import { AppProviders } from '../app/AppProviders.tsx'
import { MonthPicker } from './MonthPicker.tsx'
import '../styles.css'

/**
 * The real stylesheet in the markup LayoutView produces, as the whole app needs a server that
 * browser mode does not have. What is checked is the layout, which jsdom cannot compute.
 */
const RULE = { firstDay: 1, minimalDays: 4 } as const

function Screen({ children }: { children: ReactNode }) {
  return (
    <AppProviders now={() => new Date('2026-10-26T12:00:00')} locale="en-US">
      <div style={{ position: 'fixed', inset: 0, display: 'flex' }}>{children}</div>
    </AppProviders>
  )
}

function Child({ grow, children }: { grow: number; children: ReactNode }) {
  return (
    <div className="split-child" style={{ flexGrow: grow, flexBasis: 0 }}>
      {children}
    </div>
  )
}

const Page = ({ label }: { label: string }) => (
  <section className="page" aria-label={label} style={{ flex: 1 }} />
)

function Strip({
  orientation,
  length = 500,
}: {
  orientation: 'horizontal' | 'vertical'
  /** How long the content is along the strip. */
  length?: number
}) {
  return (
    <nav className="week-strip" aria-label="Week" data-orientation={orientation}>
      {/* Content that cannot shrink, like the days with the week label and the buttons. */}
      <div
        data-testid="content"
        style={
          orientation === 'horizontal'
            ? { width: length, height: 40, flex: 'none' }
            : { width: 60, height: length, flex: 'none' }
        }
      />
      <MonthPicker
        focus="2026-10-26"
        rule={RULE}
        onPick={() => undefined}
        open
        setOpen={() => undefined}
        strip={orientation === 'horizontal' ? 'across' : 'standing'}
      />
    </nav>
  )
}

const box = (selector: string) => {
  const element = document.querySelector(selector)
  if (element === null) throw new Error(`no ${selector}`)
  return element.getBoundingClientRect()
}

const onScreen = (rect: DOMRect) => {
  expect(rect.left).toBeGreaterThanOrEqual(0)
  expect(rect.top).toBeGreaterThanOrEqual(0)
  expect(rect.right).toBeLessThanOrEqual(window.innerWidth)
  expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight)
}

describe('week strip layout in a real browser', () => {
  it('is never narrower than its content, above a page in a narrow column on the left', async () => {
    await render(
      <Screen>
        <div className="split split-row">
          <Child grow={0.05}>
            <div className="split split-column">
              <Child grow={0.1}>
                <Strip orientation="horizontal" />
              </Child>
              <Child grow={0.9}>
                <Page label="Day" />
              </Child>
            </div>
          </Child>
          <Child grow={0.95}>
            <Page label="Week" />
          </Child>
        </div>
      </Screen>,
    )

    const strip = box('.week-strip')
    expect(strip.width).toBeGreaterThanOrEqual(box('[data-testid="content"]').width)
    // It pushes the week page aside rather than lying over it.
    expect(strip.right).toBeLessThanOrEqual(box('[aria-label="Week"].page').left)
  })

  it('is never lower than its content, beside a page in a low row at the top', async () => {
    await render(
      <Screen>
        <div className="split split-column">
          <Child grow={0.05}>
            <div className="split split-row">
              <Child grow={0.1}>
                <Strip orientation="vertical" />
              </Child>
              <Child grow={0.9}>
                <Page label="Day" />
              </Child>
            </div>
          </Child>
          <Child grow={0.95}>
            <Page label="Week" />
          </Child>
        </div>
      </Screen>,
    )

    const strip = box('.week-strip')
    expect(strip.height).toBeGreaterThanOrEqual(box('[data-testid="content"]').height)
    expect(strip.bottom).toBeLessThanOrEqual(box('[aria-label="Week"].page').top)
  })

  it('opens its month above when it lies across the bottom of the screen', async () => {
    await render(
      <Screen>
        <div className="split split-column">
          <Child grow={0.9}>
            <Page label="Day" />
          </Child>
          <Child grow={0.1}>
            <Strip orientation="horizontal" length={200} />
          </Child>
        </div>
      </Screen>,
    )

    onScreen(box('.month-calendar'))
  })

  it('opens its month on the left when it stands at the right of the screen', async () => {
    await render(
      <Screen>
        <div className="split split-row">
          <Child grow={0.9}>
            <Page label="Day" />
          </Child>
          <Child grow={0.1}>
            <Strip orientation="vertical" length={200} />
          </Child>
        </div>
      </Screen>,
    )

    onScreen(box('.month-calendar'))
  })
})
