import { ISO_WEEK, US_WEEK } from '@agendina/core'
import { describe, expect, it } from 'vitest'
import { pageTitle, weekTitle } from './weeks.ts'

describe('weekTitle', () => {
  it('names a week by its number under the week rule', () => {
    expect(weekTitle('2027-01-03', ISO_WEEK)).toBe('Week 53')
    expect(weekTitle('2027-01-03', US_WEEK)).toBe('Week 2')
  })

  it('is the title of a week page', () => {
    expect(pageTitle('week', '2026-10-26', 'en-GB', ISO_WEEK)).toBe(
      weekTitle('2026-10-26', ISO_WEEK),
    )
  })
})
