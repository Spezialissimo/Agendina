import { ISO_WEEK, US_WEEK } from '@agendina/core'
import { describe, expect, it } from 'vitest'
import { pageSubtitle, pageTitle, weekTitle } from './weeks.ts'

describe('day pages', () => {
  it('are titled by the weekday, with the date as subtitle', () => {
    expect(pageTitle('day', '2026-11-06', 'en-US', ISO_WEEK)).toBe('Friday')
    expect(pageSubtitle('day', '2026-11-06', 'en-US')).toBe('Nov 6, 2026')
  })

  it('have the week range as the subtitle of a week page', () => {
    // Intl puts thin spaces around the dash.
    expect(pageSubtitle('week', '2026-11-02', 'en-US').replace(/\s/g, ' ')).toBe('Nov 2 – 8, 2026')
  })
})

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
