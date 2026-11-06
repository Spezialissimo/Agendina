import { describe, expect, it } from 'vitest'
import { closeEdit } from './templateEdit.ts'

describe('closing a template edit', () => {
  const week = { kind: 'week', key: '2026-10-26' } as const

  it('closes the edit the closing editor opened', () => {
    expect(closeEdit(week, week)).toBeUndefined()
  })

  it('leaves an edit opened later on another page', () => {
    const later = { kind: 'week', key: '2026-11-02' } as const
    expect(closeEdit(later, week)).toBe(later)
    expect(closeEdit({ kind: 'day', key: '2026-10-26' }, week)).toEqual({
      kind: 'day',
      key: '2026-10-26',
    })
  })

  it('has nothing to close when nothing is open', () => {
    expect(closeEdit(undefined, week)).toBeUndefined()
  })
})
