import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { minimalChange } from './textChange.ts'

const apply = (text: string, change: { from: number; to: number; insert: string }) =>
  text.slice(0, change.from) + change.insert + text.slice(change.to)

describe('minimalChange', () => {
  it('replaces only the part that differs', () => {
    expect(minimalChange('- [ ] Call dentist\n- [ ] Run', '- [x] Call dentist\n- [ ] Run')).toEqual(
      {
        from: 3,
        to: 4,
        insert: 'x',
      },
    )
  })

  it('describes appending and deleting', () => {
    expect(minimalChange('abc', 'abcdef')).toEqual({ from: 3, to: 3, insert: 'def' })
    expect(minimalChange('abcdef', 'abc')).toEqual({ from: 3, to: 6, insert: '' })
  })

  it('returns undefined when nothing changed', () => {
    expect(minimalChange('same', 'same')).toBeUndefined()
  })

  it('always turns the old text into the new text', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (before, after) => {
        const change = minimalChange(before, after)
        expect(change === undefined ? before : apply(before, change)).toBe(after)
      }),
      { numRuns: 1000 },
    )
  })
})
