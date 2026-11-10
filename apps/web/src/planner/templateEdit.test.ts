import { describe, expect, it } from 'vitest'
import { closeEdit, startEdit } from './templateEdit.ts'

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

describe('starting a template edit', () => {
  it('starts from the page it is opened on', () => {
    expect(startEdit(undefined, 'day', '2026-10-27')).toEqual({ kind: 'day', key: '2026-10-27' })
  })

  it('leaves an edit already open on that page as it is', () => {
    const open = { kind: 'day', key: '2026-10-27', draft: 'unsaved' } as const
    expect(startEdit(open, 'day', '2026-10-27')).toBe(open)
  })

  it('moves an open edit to the page it is opened again on, with its unsaved text', () => {
    const open = { kind: 'day', key: '2026-10-27', draft: 'unsaved' } as const
    expect(startEdit(open, 'day', '2026-10-28')).toEqual({
      kind: 'day',
      key: '2026-10-28',
      draft: 'unsaved',
    })
  })
})
