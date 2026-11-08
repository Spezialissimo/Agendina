import { addDays } from '@agendina/core'
import { expect, test } from '@playwright/test'
import { dayPage, enter, savedOnServer } from './helpers.ts'

/** The app polls every 5 s while visible; allow one missed poll on a slow machine. */
const WITHIN_A_POLL = { timeout: 12_000 }

test('two laptops side by side see each other’s writing', async ({ browser, page }, testInfo) => {
  // From week 2 of 2027, one week later per retry, away from the other journeys' pages.
  const DAY = addDays('2027-01-12', 7 * testInfo.retry)
  await enter(page)
  const other = await browser.newContext({ baseURL: new URL(page.url()).origin })
  const otherPage = await other.newPage()
  await enter(otherPage)
  await page.goto(`/day/${DAY}`)
  await otherPage.goto(`/day/${DAY}`)
  const here = dayPage(page, DAY)
  const there = dayPage(otherPage, DAY)

  await test.step('what one writes shows up on the other without touching it', async () => {
    await here.click()
    await page.keyboard.type('Call the dentist')
    await savedOnServer(page, `day/${DAY}`, 'Call the dentist')

    await expect(there).toHaveText('Call the dentist', WITHIN_A_POLL)
  })

  await test.step('and the other way round, on a page already open on both', async () => {
    await there.click()
    await otherPage.keyboard.press('ControlOrMeta+End')
    await otherPage.keyboard.press('Enter')
    await otherPage.keyboard.type('Run 5km')
    await savedOnServer(otherPage, `day/${DAY}`, 'Call the dentist\nRun 5km')

    await expect(here.locator('.cm-line')).toHaveText(
      ['Call the dentist', 'Run 5km'],
      WITHIN_A_POLL,
    )
  })

  await other.close()
})
