import type { DayKey } from '@agendina/core'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  NO_POSITIONS,
  POSITIONS_STORAGE_KEY,
  REMEMBERED_PAGES,
  loadPositions,
  placeSelection,
  recallPosition,
  rememberPosition,
  savePositions,
  type PagePositions,
  type PageRef,
} from './pagePositions.ts'

const day = (key: DayKey): PageRef => ({ kind: 'day', key })
const week = (key: DayKey): PageRef => ({ kind: 'week', key })
const at = (anchor: number, head = anchor) => ({ anchor, head })

const remembering = (...entries: [PageRef, number][]): PagePositions =>
  entries.reduce((positions, [page, n]) => rememberPosition(positions, page, at(n)), NO_POSITIONS)

/** An in-memory Storage, so tests can also make it fail like a blocked or full one. */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  const storage = {
    get length() {
      return items.size
    },
    clear: () => {
      items.clear()
    },
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => {
      items.delete(key)
    },
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
  } satisfies Storage
  return { storage: () => storage, items }
}

describe('remembering positions', () => {
  it('recalls nothing for a page never visited', () => {
    expect(recallPosition(NO_POSITIONS, day('2026-10-26'))).toBeUndefined()
  })

  it('recalls the cursor and selection last left on a page', () => {
    let positions = rememberPosition(NO_POSITIONS, day('2026-10-26'), at(4))
    positions = rememberPosition(positions, day('2026-10-26'), at(2, 9))

    expect(recallPosition(positions, day('2026-10-26'))).toEqual({ anchor: 2, head: 9 })
  })

  it('keeps day and week pages apart, even with the same key', () => {
    const positions = remembering([day('2026-10-26'), 1], [week('2026-10-26'), 7])

    expect(recallPosition(positions, day('2026-10-26'))).toEqual(at(1))
    expect(recallPosition(positions, week('2026-10-26'))).toEqual(at(7))
  })

  it('forgets the least recently used page when a fourth one of its kind comes in', () => {
    expect(REMEMBERED_PAGES).toBe(3)
    const positions = remembering(
      [day('2026-10-26'), 1],
      [day('2026-10-27'), 2],
      [day('2026-10-28'), 3],
      [day('2026-10-29'), 4],
    )

    expect(recallPosition(positions, day('2026-10-26'))).toBeUndefined()
    expect(recallPosition(positions, day('2026-10-27'))).toEqual(at(2))
    expect(recallPosition(positions, day('2026-10-29'))).toEqual(at(4))
  })

  it('counts a page used again as the most recent one', () => {
    const positions = remembering(
      [day('2026-10-26'), 1],
      [day('2026-10-27'), 2],
      [day('2026-10-28'), 3],
      [day('2026-10-26'), 5],
      [day('2026-10-29'), 4],
    )

    expect(recallPosition(positions, day('2026-10-26'))).toEqual(at(5))
    expect(recallPosition(positions, day('2026-10-27'))).toBeUndefined()
  })

  it('counts day and week pages separately', () => {
    const positions = remembering(
      [week('2026-10-19'), 1],
      [day('2026-10-26'), 1],
      [day('2026-10-27'), 1],
      [day('2026-10-28'), 1],
      [day('2026-10-29'), 1],
    )

    expect(recallPosition(positions, week('2026-10-19'))).toEqual(at(1))
  })

  it('always holds the latest position of the last three pages of each kind', () => {
    const page = fc.record({
      kind: fc.constantFrom('day' as const, 'week' as const),
      key: fc.constantFrom<DayKey[]>(
        '2026-10-26',
        '2026-10-27',
        '2026-10-28',
        '2026-11-02',
        '2026-11-09',
      ),
    })
    const visit = fc.tuple(page, fc.nat(1000), fc.nat(1000))
    fc.assert(
      fc.property(fc.array(visit, { maxLength: 30 }), (visits) => {
        const positions = visits.reduce(
          (p, [ref, anchor, head]) => rememberPosition(p, ref, { anchor, head }),
          NO_POSITIONS,
        )
        for (const kind of ['day', 'week'] as const) {
          // The model: the distinct pages of this kind, most recent visit first.
          const latest = new Map<DayKey, { anchor: number; head: number }>()
          for (const [ref, anchor, head] of visits.filter(([ref]) => ref.kind === kind).reverse())
            if (!latest.has(ref.key)) latest.set(ref.key, { anchor, head })
          const kept = [...latest].slice(0, REMEMBERED_PAGES)
          const forgotten = [...latest].slice(REMEMBERED_PAGES)
          for (const [key, selection] of kept)
            expect(recallPosition(positions, { kind, key })).toEqual(selection)
          for (const [key] of forgotten)
            expect(recallPosition(positions, { kind, key })).toBeUndefined()
        }
      }),
    )
  })
})

describe('placing the cursor', () => {
  it('goes to the end of the page when nothing is remembered', () => {
    expect(placeSelection(undefined, 12)).toEqual(at(12))
  })

  it('restores the remembered selection when it fits the text', () => {
    expect(placeSelection(at(3, 8), 12)).toEqual(at(3, 8))
  })

  it('clamps a remembered selection into a text that got shorter elsewhere', () => {
    expect(placeSelection(at(20, 4), 10)).toEqual(at(10, 4))
    expect(placeSelection(at(15, 30), 10)).toEqual(at(10))
    expect(placeSelection(at(5), 0)).toEqual(at(0))
  })

  it('always lands inside the text', () => {
    fc.assert(
      fc.property(fc.nat(500), fc.nat(500), fc.nat(500), (anchor, head, length) => {
        const placed = placeSelection({ anchor, head }, length)
        expect(placed.anchor).toBeGreaterThanOrEqual(0)
        expect(placed.anchor).toBeLessThanOrEqual(length)
        expect(placed.head).toBeGreaterThanOrEqual(0)
        expect(placed.head).toBeLessThanOrEqual(length)
      }),
    )
  })
})

describe('storing positions on this device', () => {
  it('reads back what it stored', () => {
    const { storage } = fakeStorage()
    const positions = remembering([day('2026-10-26'), 3], [week('2026-10-26'), 5])

    savePositions(storage, positions)

    expect(loadPositions(storage)).toEqual(positions)
  })

  it('stores them under its own key, as JSON', () => {
    const { storage, items } = fakeStorage()

    savePositions(storage, remembering([day('2026-10-26'), 3]))

    expect(JSON.parse(items.get(POSITIONS_STORAGE_KEY) ?? 'null')).toEqual({
      day: [{ key: '2026-10-26', anchor: 3, head: 3 }],
      week: [],
    })
  })

  it('starts empty when nothing was stored', () => {
    expect(loadPositions(fakeStorage().storage)).toEqual(NO_POSITIONS)
  })

  it.each([
    ['not JSON', '{day:'],
    ['not an object', '42'],
    ['missing a kind', '{"day":[]}'],
    ['a negative position', '{"day":[{"key":"2026-10-26","anchor":-1,"head":0}],"week":[]}'],
    ['a fractional position', '{"day":[{"key":"2026-10-26","anchor":1.5,"head":0}],"week":[]}'],
    ['a key that is not a day', '{"day":[{"key":"tomorrow","anchor":1,"head":1}],"week":[]}'],
  ])('ignores stored data that is %s', (_, stored) => {
    const { storage } = fakeStorage({ [POSITIONS_STORAGE_KEY]: stored })

    expect(loadPositions(storage)).toEqual(NO_POSITIONS)
  })

  it('keeps no more than three pages of a kind from stored data', () => {
    const entries = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].map((key) => ({
      key,
      anchor: 1,
      head: 1,
    }))
    const { storage } = fakeStorage({
      [POSITIONS_STORAGE_KEY]: JSON.stringify({ day: entries, week: [] }),
    })

    const positions = loadPositions(storage)

    expect(recallPosition(positions, day('2026-10-28'))).toEqual(at(1))
    expect(recallPosition(positions, day('2026-10-29'))).toBeUndefined()
  })

  it('works without storage when the browser blocks it', () => {
    const blocked = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }

    expect(loadPositions(blocked)).toEqual(NO_POSITIONS)
    expect(() => {
      savePositions(blocked, remembering([day('2026-10-26'), 3]))
    }).not.toThrow()
  })

  it('carries on when the storage is full', () => {
    const { storage } = fakeStorage()
    storage().setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }

    expect(() => {
      savePositions(storage, remembering([day('2026-10-26'), 3]))
    }).not.toThrow()
  })
})
