import {
  MAX_LAYOUT_NAME,
  MAX_PANELS,
  addPanel,
  contentKey,
  layoutProblems,
  movePanel,
  panelContent,
  panelsOf,
  removePanel,
  setPanelContent,
  setSplitDirection,
  setSplitSizes,
  shiftPanel,
  type Layout,
  type PanelContent,
  type PanelNode,
  type PanelSide,
} from '@agendina/core'
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { SplitView } from './LayoutView.tsx'
import { dropTarget, measurePanels, useGlidingPanels, type PanelRect } from './layoutDrag.ts'

interface Props {
  /** The layout as edited so far; nothing is saved until `onSave`. */
  layout: Layout
  /** The name the layout is saved with. */
  name: string
  onRename: (name: string) => void
  onChange: (layout: Layout) => void
  onCancel: () => void
  onSave: () => void
}

/** The pages offered in a panel's list: a few days and weeks around the selected one. */
const OFFSETS = {
  day: [-3, -2, -1, 0, 1, 2, 3],
  week: [-2, -1, 0, 1, 2],
}

/** How far the pointer travels with the button down before a page is picked up. */
const DRAG_THRESHOLD_PX = 6

/** A page being carried to another place. */
interface Drag {
  panelId: string
  label: string
  /** The layout when the page was picked up, and where its pages were on the screen. */
  base: Layout
  rects: PanelRect[]
  /** The layout as it would be if the page were dropped now: shown while dragging. */
  preview: Layout
  /** The page and side under the pointer that `preview` was made for. */
  over: string | undefined
  x: number
  y: number
  /** The card that follows the pointer: its size, and where on it the pointer holds it (0 to 1). */
  card: { width: number; height: number; holdX: number; holdY: number }
}

/** The carried card is at most this big, so that the pages behind it stay in view. */
const CARD_MAX = { width: 340, height: 220 }

/** Where the carried card is on the screen. */
function cardRect({ x, y, card }: Drag) {
  return {
    left: x - card.holdX * card.width,
    top: y - card.holdY * card.height,
    width: card.width,
    height: card.height,
  }
}

function cardTransform(drag: Drag): string {
  const { left, top } = cardRect(drag)
  return `translate(${String(left)}px, ${String(top)}px) rotate(1.5deg)`
}

/** The buttons on each side of a page: add a page there, move the page that way. */
const SIDES: { side: PanelSide; arrow: string; add: string; move: string }[] = [
  { side: 'left', arrow: '←', add: 'Add page on the left', move: 'Move page left' },
  { side: 'right', arrow: '→', add: 'Add page on the right', move: 'Move page right' },
  { side: 'top', arrow: '↑', add: 'Add page above', move: 'Move page up' },
  { side: 'bottom', arrow: '↓', add: 'Add page below', move: 'Move page down' },
]

/** For the panels: which one is being dragged, and how to pick one up. */
const DragContext = createContext<{
  dragging: string | undefined
  grab: (panelId: string, label: string, x: number, y: number) => void
}>({ dragging: undefined, grab: () => undefined })

export function contentLabel(content: PanelContent): string {
  if (content.kind === 'calendar') return 'Calendar'
  const { kind, offset } = content
  if (offset === 0) return `Selected ${kind}`
  const side = offset < 0 ? 'before' : 'after'
  const distance = Math.abs(offset)
  if (distance === 1) return `${kind === 'day' ? 'Day' : 'Week'} ${side}`
  return `${String(distance)} ${kind}s ${side}`
}

function contentHint(content: PanelContent): string {
  if (content.kind === 'calendar') return 'A month to pick a day from.'
  return content.offset === 0
    ? `The ${content.kind} you select.`
    : `Written in where it is, next to the ${content.kind} you select.`
}

/** A change is offered only if the layout still works after it. */
function allowed(change: () => Layout): boolean {
  try {
    return layoutProblems(change()).length === 0
  } catch {
    return false
  }
}

/** The pages a panel showing `current` can be set to, grouped as in its list. */
function choicesFor(current: PanelContent): { group: string; contents: PanelContent[] }[] {
  const pagesOf = (kind: keyof typeof OFFSETS): PanelContent[] => {
    const offsets = OFFSETS[kind]
    // A page set elsewhere (the API) is still shown.
    const all =
      current.kind !== kind || offsets.includes(current.offset)
        ? offsets
        : [...offsets, current.offset].sort((a, b) => a - b)
    return all.map((offset) => ({ kind, offset }))
  }
  return [
    { group: 'Days', contents: pagesOf('day') },
    { group: 'Weeks', contents: pagesOf('week') },
    { group: 'Navigation', contents: [{ kind: 'calendar' }] },
  ]
}

/** Which of a panel's controls are offered. */
interface PanelChecks {
  /** The `contentKey`s of the pages it cannot be set to. */
  unavailable: Set<string>
  canDelete: boolean
  canShift: Record<PanelSide, boolean>
}

/**
 * Every panel's checks at once, once per layout: each one tries the change on a copy of the
 * layout, too slow to repeat on every render while a page is dragged.
 */
function checksOf(layout: Layout): Map<string, PanelChecks> {
  return new Map(
    panelsOf(layout).map((node) => {
      const current = panelContent(node.panel)
      const unavailable = new Set(
        choicesFor(current)
          .flatMap(({ contents }) => contents)
          .filter(
            (content) =>
              contentKey(content) !== contentKey(current) &&
              !allowed(() => setPanelContent(layout, node.id, content)),
          )
          .map(contentKey),
      )
      const canShift = Object.fromEntries(
        SIDES.map(({ side }) => [side, allowed(() => shiftPanel(layout, node.id, side))]),
      ) as Record<PanelSide, boolean>
      const canDelete = allowed(() => removePanel(layout, node.id))
      return [node.id, { unavailable, canDelete, canShift }]
    }),
  )
}

/**
 * Edits the layout in place of the pages: each page is a placeholder with its controls, splits
 * keep their splitters. Works on a draft, like the template editor (ADR 0005).
 */
export function LayoutEditor({ layout, name, onRename, onChange, onCancel, onSave }: Props) {
  const titleId = useId()
  const pages = useRef<HTMLDivElement>(null)
  const pressed = useRef<{ panelId: string; label: string; x: number; y: number } | undefined>(
    undefined,
  )
  // The drag as the pointer handlers see it (always current) and as it is rendered.
  const carried = useRef<Drag | undefined>(undefined)
  const [drag, setDrag] = useState<Drag | undefined>(undefined)
  const card = useRef<HTMLDivElement>(null)
  const shown = drag?.preview ?? layout
  const checks = useMemo(() => checksOf(shown), [shown])
  // Also when a drag starts or ends: the page then glides from the card into its place.
  const glideFrom = useGlidingPanels(pages, shown, drag?.panelId)

  useEffect(() => {
    const update = (next: Drag | undefined) => {
      carried.current = next
      setDrag(next)
    }
    const move = (event: PointerEvent) => {
      const start = pressed.current
      if (start === undefined) return
      const { clientX: x, clientY: y } = event
      let current = carried.current
      if (current === undefined) {
        if (Math.hypot(x - start.x, y - start.y) < DRAG_THRESHOLD_PX) return
        const rects = measurePanels(pages.current)
        const own = rects.find((r) => r.id === start.panelId)
        current = {
          panelId: start.panelId,
          label: start.label,
          base: layout,
          rects,
          preview: layout,
          over: undefined,
          x,
          y,
          card: {
            width: Math.min(own?.width ?? CARD_MAX.width, CARD_MAX.width),
            height: Math.min(own?.height ?? CARD_MAX.height, CARD_MAX.height),
            holdX: own === undefined || own.width === 0 ? 0.5 : (start.x - own.left) / own.width,
            holdY: own === undefined || own.height === 0 ? 0.5 : (start.y - own.top) / own.height,
          },
        }
      }
      // Against the places the pages had when the drag started: the preview moves them, and
      // testing against that would flip back and forth under a pointer that stands still.
      const hit = dropTarget(current.rects, x, y)
      const over = hit === undefined ? current.over : `${hit.id}:${hit.side}`
      if (carried.current !== undefined && over === current.over) {
        // Only the card moves: no render, which would redo the whole editor at every event.
        carried.current = { ...current, x, y }
        if (card.current !== null) card.current.style.transform = cardTransform(carried.current)
        return
      }
      let { preview } = current
      if (hit !== undefined && over !== current.over) {
        preview =
          hit.id === current.panelId
            ? current.base
            : movePanel(current.base, current.panelId, hit.id, hit.side)
      }
      update({ ...current, preview, over, x, y })
    }
    const drop = () => {
      const dropped = carried.current
      pressed.current = undefined
      if (dropped === undefined) return
      glideFrom(dropped.panelId, cardRect(dropped))
      update(undefined)
      if (dropped.preview !== dropped.base) onChange(dropped.preview)
    }
    const cancel = () => {
      pressed.current = undefined
      const dropped = carried.current
      if (dropped === undefined) return
      glideFrom(dropped.panelId, cardRect(dropped))
      update(undefined)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', drop)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', drop)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
    }
  }, [layout, onChange, glideFrom])

  return (
    <section
      className="layout-editor"
      aria-labelledby={titleId}
      data-dragging={drag !== undefined || undefined}
    >
      <header className="layout-editor-bar">
        <div>
          <h3 id={titleId}>Layout</h3>
          <p className="hint">
            Choose the pages on the screen and how they are arranged. Drag a page to move it, drag
            between two pages to resize them. Nothing changes until you save.
          </p>
          <label className="layout-editor-name">
            Name
            <input
              type="text"
              value={name}
              maxLength={MAX_LAYOUT_NAME}
              onChange={(event) => {
                onRename(event.target.value)
              }}
            />
          </label>
        </div>
        <div className="conflict-actions">
          <button type="button" className="link" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={layoutProblems(layout).length > 0}
            onClick={onSave}
          >
            Save layout
          </button>
        </div>
      </header>
      <div className="layout-editor-pages" ref={pages}>
        <DragContext
          value={{
            dragging: drag?.panelId,
            grab: (panelId, label, x, y) => {
              pressed.current = { panelId, label, x, y }
            },
          }}
        >
          <Node node={shown} layout={shown} checks={checks} onChange={onChange} />
        </DragContext>
      </div>
      {drag !== undefined && (
        // The page being carried, under the pointer where it was taken.
        <div
          ref={card}
          className="layout-panel layout-drag-card"
          aria-hidden="true"
          style={{
            width: drag.card.width,
            height: drag.card.height,
            transform: cardTransform(drag),
          }}
        >
          <div className="layout-panel-body">
            <p className="layout-panel-title">{drag.label}</p>
          </div>
        </div>
      )}
    </section>
  )
}

interface NodeProps extends Pick<Props, 'layout' | 'onChange'> {
  node: Layout
  checks: Map<string, PanelChecks>
}

function Node({ node, layout, checks, onChange }: NodeProps) {
  if (node.type === 'panel') {
    return <Panel node={node} layout={layout} checks={checks} onChange={onChange} />
  }
  return (
    <div className="layout-split">
      <label className="layout-split-bar">
        Arrange pages
        <select
          value={node.direction}
          onChange={(event) => {
            const direction = event.target.value === 'column' ? 'column' : 'row'
            onChange(setSplitDirection(layout, node.id, direction))
          }}
        >
          <option value="row">Side by side</option>
          <option value="column">Stacked</option>
        </select>
      </label>
      <SplitView
        split={node}
        onResize={(splitId, sizes) => {
          onChange(setSplitSizes(layout, splitId, sizes))
        }}
        renderChild={(child) => (
          <Node node={child} layout={layout} checks={checks} onChange={onChange} />
        )}
      />
    </div>
  )
}

function Panel({ node, layout, checks, onChange }: { node: PanelNode } & NodeProps) {
  const current = panelContent(node.panel)
  const label = contentLabel(current)
  const canAdd = panelsOf(layout).length < MAX_PANELS
  const { dragging, grab } = useContext(DragContext)
  if (dragging === node.id) {
    // The page is in the air: this is the empty place it would land in.
    return (
      <div
        className="layout-panel layout-panel-slot"
        role="group"
        aria-label={`${label} panel`}
        data-panel-id={node.id}
      />
    )
  }
  const choices = choicesFor(current)
  const { unavailable, canDelete, canShift } = checks.get(node.id) ?? {
    unavailable: new Set<string>(),
    canDelete: false,
    canShift: { left: false, right: false, top: false, bottom: false },
  }
  return (
    <div
      className="layout-panel"
      role="group"
      aria-label={`${label} panel`}
      data-selected={(current.kind !== 'calendar' && current.offset === 0) || undefined}
      data-panel-id={node.id}
      // The whole page is picked up, from anywhere on it but its controls.
      onPointerDown={(event) => {
        if (event.button !== 0) return
        if ((event.target as Element).closest('select, button, label') !== null) return
        grab(node.id, label, event.clientX, event.clientY)
      }}
    >
      {/* Its own box, so that it keeps its shape while the page glides (layoutDrag.ts). */}
      <div className="layout-panel-body" data-panel-body>
        <div className="layout-panel-main">
          <div className="layout-panel-handle">
            <p className="layout-panel-title">{label}</p>
            <p className="hint">{contentHint(current)}</p>
          </div>
          <div className="layout-panel-center">
            <select
              aria-label="Shows"
              value={contentKey(current)}
              onChange={(event) => {
                const chosen = choices
                  .flatMap((choice) => choice.contents)
                  .find((content) => contentKey(content) === event.target.value)
                if (chosen !== undefined) onChange(setPanelContent(layout, node.id, chosen))
              }}
            >
              {choices.map(({ group, contents }) => (
                <optgroup key={group} label={group}>
                  {contents.map((content) => (
                    <option
                      key={contentKey(content)}
                      value={contentKey(content)}
                      disabled={unavailable.has(contentKey(content))}
                    >
                      {contentLabel(content)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              className="layout-panel-delete"
              // The note itself is not touched: only its place on the screen goes.
              title="Take this page off the layout (what is written in it is kept)"
              disabled={!canDelete}
              onClick={() => {
                onChange(removePanel(layout, node.id))
              }}
            >
              Delete page
            </button>
          </div>
        </div>
        {SIDES.map(({ side, arrow, add, move }) => (
          <div key={side} className={`layout-panel-edge layout-panel-edge-${side}`}>
            <button
              type="button"
              aria-label={add}
              title={add}
              disabled={!canAdd}
              onClick={() => {
                onChange(addPanel(layout, node.id, side))
              }}
            >
              <span aria-hidden="true">+</span>
            </button>
            <button
              type="button"
              aria-label={move}
              title={move}
              disabled={!canShift[side]}
              onClick={() => {
                onChange(shiftPanel(layout, node.id, side))
              }}
            >
              <span aria-hidden="true">{arrow}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
