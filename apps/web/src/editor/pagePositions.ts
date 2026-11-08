import { NoteKey, type NoteKind } from '@agendina/contract'
import type { DayKey } from '@agendina/core'
import { z } from 'zod'

/** Where the cursor (and the selection's other end) was in a page's text. */
export interface PageSelection {
  anchor: number
  head: number
}

export interface PageRef {
  kind: NoteKind
  key: DayKey
}

type Entry = { key: DayKey } & PageSelection

/** The positions this device remembers: the most recently used pages first, per kind. */
export interface PagePositions {
  day: Entry[]
  week: Entry[]
}

/** How many pages of each kind are remembered. */
export const REMEMBERED_PAGES = 3

export const POSITIONS_STORAGE_KEY = 'agendina.pagePositions'

export const NO_POSITIONS: PagePositions = { day: [], week: [] }

const Offset = z.number().int().nonnegative()
const Entries = z
  .array(z.object({ key: NoteKey, anchor: Offset, head: Offset }))
  .transform((entries) => entries.slice(0, REMEMBERED_PAGES))
const Stored = z.object({ day: Entries, week: Entries })

export function rememberPosition(
  positions: PagePositions,
  page: PageRef,
  { anchor, head }: PageSelection,
): PagePositions {
  const others = positions[page.kind].filter((e) => e.key !== page.key)
  const entries = [{ key: page.key, anchor, head }, ...others].slice(0, REMEMBERED_PAGES)
  return { ...positions, [page.kind]: entries }
}

export function recallPosition(positions: PagePositions, page: PageRef): PageSelection | undefined {
  const entry = positions[page.kind].find((e) => e.key === page.key)
  return entry === undefined ? undefined : { anchor: entry.anchor, head: entry.head }
}

/** The selection to restore in a text of `length`: the remembered one clamped, else the end. */
export function placeSelection(
  remembered: PageSelection | undefined,
  length: number,
): PageSelection {
  if (remembered === undefined) return { anchor: length, head: length }
  const clamp = (n: number) => Math.min(Math.max(n, 0), length)
  return { anchor: clamp(remembered.anchor), head: clamp(remembered.head) }
}

/** Reads the remembered positions; anything missing, unreadable or invalid counts as none. */
export function loadPositions(storage: () => Storage): PagePositions {
  try {
    const stored = storage().getItem(POSITIONS_STORAGE_KEY)
    if (stored === null) return NO_POSITIONS
    const parsed = Stored.safeParse(JSON.parse(stored))
    return parsed.success ? parsed.data : NO_POSITIONS
  } catch {
    return NO_POSITIONS
  }
}

/** Stores the positions on this device; a full or blocked storage only means they are not kept. */
export function savePositions(storage: () => Storage, positions: PagePositions): void {
  try {
    storage().setItem(POSITIONS_STORAGE_KEY, JSON.stringify(positions))
  } catch {
    // Remembering positions is a convenience: without storage, pages open at the end.
  }
}

/** The browser's storage for this site, read lazily: merely touching it can throw. */
export const browserStorage = () => window.localStorage
