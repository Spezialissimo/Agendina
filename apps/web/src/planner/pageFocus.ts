import type { NoteKind } from '@agendina/contract'
import type { DayKey, NoteView, ResolvedLayout } from '@agendina/core'
import { createContext, useContext, useSyncExternalStore } from 'react'

/** The page whose editor should get keyboard focus once it is ready. */
export interface FocusRequest {
  id: number
  kind: NoteKind
  /** The page's view key: the day, or the first day of the week. */
  key: DayKey
  /** The day navigated to; the request lapses when another day is opened. */
  day: DayKey
}

/**
 * The selected page of the kind asked for in `layout`, or else the first selected page. Never a
 * neighbour: a navigation is about the day it selects.
 */
export function focusTarget(
  layout: ResolvedLayout,
  side: NoteKind,
): Pick<NoteView, 'kind' | 'key'> | undefined {
  const selected = selectedViews(layout)
  return selected.find((v) => v.kind === side) ?? selected[0]
}

function selectedViews(layout: ResolvedLayout): NoteView[] {
  if (layout.type === 'panel') {
    return layout.view.type === 'note' && layout.view.selected ? [layout.view] : []
  }
  return layout.children.flatMap((c) => selectedViews(c.node))
}

/** A touch-only device: its primary pointer is coarse, and it has no fine one (mouse, trackpad). */
function coarsePointerOnly(): boolean {
  if (typeof window.matchMedia !== 'function') return false
  return (
    window.matchMedia('(pointer: coarse)').matches &&
    !window.matchMedia('(any-pointer: fine)').matches
  )
}

/**
 * Moves keyboard focus into the page arrived at after a navigation, once its editor is ready.
 * Also follows which kind of page the user was writing in (the "side"), through clicks on the week
 * strip and the command palette, which take focus away from the editor for a moment.
 *
 * A request lapses as soon as the user moves on: any focus change or pointer press, or another
 * day opened (e.g. with the browser's back button), so it never steals focus later.
 */
export class PageFocus {
  private current: FocusRequest | undefined
  private nextId = 1
  private readonly listeners = new Set<() => void>()
  /** The kind of page editor the user was last in, or undefined after they left the pages. */
  side: NoteKind | undefined
  private lastInput: 'keyboard' | 'pointer' | 'touch' | undefined

  get = (): FocusRequest | undefined => this.current

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  request(kind: NoteKind, key: DayKey, day: DayKey): void {
    this.set({ id: this.nextId++, kind, key, day })
  }

  /** Ends request `id` (fulfilled), or the current one. */
  cancel(id?: number): void {
    if (this.current !== undefined && (id === undefined || this.current.id === id))
      this.set(undefined)
  }

  /** Follows focus and pointer presses in `doc`; returns the cleanup. */
  connect(doc: Document): () => void {
    const moved = (event: Event) => {
      this.follow(event.target)
      this.cancel()
    }
    const pressed = (event: PointerEvent) => {
      this.lastInput = event.pointerType === 'touch' ? 'touch' : 'pointer'
      moved(event)
    }
    const typed = () => {
      this.lastInput = 'keyboard'
    }
    doc.addEventListener('focusin', moved, true)
    doc.addEventListener('pointerdown', pressed, true)
    doc.addEventListener('keydown', typed, true)
    return () => {
      doc.removeEventListener('focusin', moved, true)
      doc.removeEventListener('pointerdown', pressed, true)
      doc.removeEventListener('keydown', typed, true)
    }
  }

  /**
   * Whether a navigation now may put the cursor in the new page. Not when it was started by touch
   * (the last pointer press was a touch, or the device has no fine pointer at all and no key was
   * pressed since): bringing up the on-screen keyboard would hide the page that was just opened.
   * Keys, e.g. a shortcut on a tablet's physical keyboard, always may.
   */
  mayMoveFocus(): boolean {
    if (this.lastInput === 'keyboard') return true
    if (this.lastInput === 'touch') return false
    return !coarsePointerOnly()
  }

  private follow(target: EventTarget | null): void {
    if (!(target instanceof Element)) return
    const page = target.closest('[data-editor]')?.closest<HTMLElement>('[data-page-kind]')
    const kind = page?.dataset.pageKind
    if (kind === 'day' || kind === 'week') this.side = kind
    else if (target.closest('[data-keeps-page-side]') === null) this.side = undefined
  }

  private set(request: FocusRequest | undefined): void {
    this.current = request
    for (const listener of this.listeners) listener()
  }
}

export interface PageFocusApi {
  store: PageFocus
  /**
   * Asks for focus in the page `day` opens, on `side` (by default the side the user was writing
   * on, or else the day page). Call it right before navigating.
   */
  focusAfterNavigation: (day: DayKey, side?: NoteKind) => void
}

export const PageFocusContext = createContext<PageFocusApi | undefined>(undefined)

export function usePageFocus(): PageFocusApi {
  const context = useContext(PageFocusContext)
  if (context === undefined) throw new Error('Missing <PageFocusContext>')
  return context
}

/** The pending focus request for `view`, with a function to end it once fulfilled. */
export function useFocusRequest(view: NoteView): { id: number; done: () => void } | undefined {
  const { store } = usePageFocus()
  const request = useSyncExternalStore(store.subscribe, store.get)
  if (request === undefined || request.kind !== view.kind || request.key !== view.key)
    return undefined
  const { id } = request
  return {
    id,
    done: () => {
      store.cancel(id)
    },
  }
}
