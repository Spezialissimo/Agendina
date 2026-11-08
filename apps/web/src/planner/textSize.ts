import { useSyncExternalStore } from 'react'
import { z } from 'zod'

export const TextSize = z.enum(['small', 'medium', 'large'])
export type TextSize = z.infer<typeof TextSize>

export type PageKind = 'day' | 'week'

export const TEXT_SIZE_LABEL: Record<TextSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

const ORDER: TextSize[] = ['small', 'medium', 'large']

export function nextTextSize(size: TextSize): TextSize {
  return ORDER[(ORDER.indexOf(size) + 1) % ORDER.length] ?? 'medium'
}

const storageKey = (kind: PageKind) => `agendina.textSize.${kind}`

/** Used while the browser refuses to store anything, so the control still works until reload. */
const unsaved = new Map<PageKind, TextSize>()
const listeners = new Set<() => void>()

/** A device preference: stored in this browser only, never on the server. */
export function readTextSize(kind: PageKind): TextSize {
  const remembered = unsaved.get(kind)
  if (remembered !== undefined) return remembered
  try {
    const parsed = TextSize.safeParse(localStorage.getItem(storageKey(kind)))
    return parsed.success ? parsed.data : 'medium'
  } catch {
    return 'medium'
  }
}

/** Forgets sizes that could not be stored (for tests, which share this module). */
export function forgetUnsavedTextSizes(): void {
  unsaved.clear()
}

export function writeTextSize(kind: PageKind, size: TextSize): void {
  try {
    localStorage.setItem(storageKey(kind), size)
    unsaved.delete(kind)
  } catch {
    unsaved.set(kind, size)
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

export function useTextSize(kind: PageKind): TextSize {
  return useSyncExternalStore(subscribe, () => readTextSize(kind))
}
