import type { ResolvedLayout } from '@agendina/core'
import {
  Fragment,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { CalendarPage } from './CalendarPage.tsx'
import { NotePage } from './NotePage.tsx'

const KEYBOARD_STEP = 0.05

interface Props {
  layout: ResolvedLayout
  /** Called with a split's new relative sizes when the user finishes resizing it. */
  onResize: (splitId: string, sizes: number[]) => void
}

export function LayoutView({ layout, onResize }: Props) {
  if (layout.type === 'panel') {
    return layout.view.type === 'calendar' ? (
      <CalendarPage view={layout.view} />
    ) : (
      <NotePage view={layout.view} />
    )
  }
  return (
    <SplitView
      split={layout}
      onResize={onResize}
      renderChild={(child) => <LayoutView layout={child} onResize={onResize} />}
    />
  )
}

interface SplitProps<Node extends { id: string }> extends Pick<Props, 'onResize'> {
  split: { id: string; direction: 'row' | 'column'; children: { node: Node; size: number }[] }
  renderChild: (node: Node) => ReactNode
}

/** The children of a split with a splitter between them; also used by the layout editor. */
export function SplitView<Node extends { id: string }>({
  split,
  onResize,
  renderChild,
}: SplitProps<Node>) {
  const key = split.children.map((c) => c.size).join()
  const fromSettings = normalize(split.children.map((c) => c.size))
  const [state, setState] = useState({ key, sizes: fromSettings })
  // Follow sizes coming from settings (e.g. saved on another device): reset when they change.
  if (state.key !== key) setState({ key, sizes: fromSettings })
  const sizes = state.sizes
  const setSizes = (next: number[]) => {
    setState({ key, sizes: next })
  }
  const container = useRef<HTMLDivElement>(null)
  const drag = useRef<{ index: number; start: number; sizes: number[] } | undefined>(undefined)
  const row = split.direction === 'row'

  const move = (index: number, from: number[], delta: number): number[] => {
    const next = [...from]
    const pair = (from[index] ?? 0) + (from[index + 1] ?? 0)
    const a = Math.min(Math.max((from[index] ?? 0) + delta, 0), pair)
    next[index] = round(a)
    next[index + 1] = round(pair - a)
    return next
  }

  const commit = (next: number[]) => {
    setSizes(next)
    onResize(split.id, next)
  }

  const cancelDrag = () => {
    if (drag.current === undefined) return
    setSizes(drag.current.sizes)
    drag.current = undefined
  }

  const onKeyDown = (index: number) => (event: KeyboardEvent) => {
    const grow = row ? 'ArrowRight' : 'ArrowDown'
    const shrink = row ? 'ArrowLeft' : 'ArrowUp'
    if (event.key !== grow && event.key !== shrink) return
    event.preventDefault()
    commit(move(index, sizes, event.key === grow ? KEYBOARD_STEP : -KEYBOARD_STEP))
  }

  const position = (event: PointerEvent) => (row ? event.clientX : event.clientY)
  const extent = () => {
    const rect = container.current?.getBoundingClientRect()
    return (row ? rect?.width : rect?.height) ?? 1
  }

  return (
    <div ref={container} className={`split split-${split.direction}`}>
      {split.children.map((child, index) => (
        <Fragment key={child.node.id}>
          {index > 0 && (
            <div
              role="separator"
              aria-label="Resize pages"
              aria-orientation={row ? 'vertical' : 'horizontal'}
              aria-valuenow={Math.round((sizes[index - 1] ?? 0) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              className="separator"
              onKeyDown={onKeyDown(index - 1)}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                drag.current = { index: index - 1, start: position(event), sizes }
              }}
              onPointerMove={(event) => {
                if (drag.current === undefined) return
                const { index: i, start, sizes: from } = drag.current
                setSizes(move(i, from, (position(event) - start) / extent()))
              }}
              onPointerUp={(event) => {
                if (drag.current === undefined) return
                const { index: i, start, sizes: from } = drag.current
                drag.current = undefined
                commit(move(i, from, (position(event) - start) / extent()))
              }}
              // The browser took the gesture over (e.g. to scroll on touch): no pointerup comes.
              onPointerCancel={cancelDrag}
              onLostPointerCapture={cancelDrag}
            />
          )}
          <div className="split-child" style={{ flexGrow: sizes[index] ?? 1, flexBasis: 0 }}>
            {renderChild(child.node)}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

function normalize(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0)
  return sizes.map((s) => round(s / total))
}

/** Sizes are stored in settings; four decimals are plenty and keep the JSON readable. */
function round(n: number): number {
  return Math.round(n * 10000) / 10000
}
