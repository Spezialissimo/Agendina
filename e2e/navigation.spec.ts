import { addDays } from '@agendina/core'
import { expect, test } from '@playwright/test'
import { dayPage, enter, revealButtons, savedOnServer } from './helpers.ts'

test('focus follows navigation', async ({ page }, testInfo) => {
  // ISO week 2 of 2027 (11–17 January), away from the other journeys; one week later per retry.
  const monday = addDays('2027-01-11', 7 * testInfo.retry)
  const thursday = addDays(monday, 3)
  const friday = addDays(monday, 4)
  const weekName = `Week ${String(2 + testInfo.retry)}`
  const nextWeekName = `Week ${String(3 + testInfo.retry)}`
  await enter(page)
  await page.goto(`/day/${thursday}`)

  await test.step('a day shortcut carries on typing in the next day', async () => {
    await dayPage(page, thursday).click()
    await page.keyboard.type('Call')
    await page.keyboard.press('ControlOrMeta+Shift+Period')
    await expect(dayPage(page, friday)).toBeFocused()
    await page.keyboard.type('Friday')
    await savedOnServer(page, `day/${friday}`, 'Friday')
  })

  await test.step('and back, the text continues where you left off', async () => {
    await page.keyboard.press('ControlOrMeta+Shift+Comma')
    await expect(dayPage(page, thursday)).toBeFocused()
    await page.keyboard.type(' mum')
    await savedOnServer(page, `day/${thursday}`, 'Call mum')
  })

  await test.step('a week shortcut keeps you in the week page', async () => {
    const week = page.getByRole('textbox', { name: weekName })
    await week.click()
    await page.keyboard.type('Plan')
    await page.keyboard.press('ControlOrMeta+Alt+Shift+Period')
    await expect(page.getByRole('textbox', { name: nextWeekName })).toBeFocused()
    await page.keyboard.press('ControlOrMeta+Alt+Shift+Comma')
    await expect(week).toBeFocused()
    await page.keyboard.type(' ahead')
    await savedOnServer(page, `week/${monday}`, 'Plan ahead')
  })

  await test.step('⌃⇧L and ⌃⇧H move the cursor between the pages side by side', async () => {
    await page.keyboard.press('Control+Shift+KeyL')
    await expect(dayPage(page, thursday)).toBeFocused()
    await page.keyboard.type('!')
    await savedOnServer(page, `day/${thursday}`, 'Call mum!')
    await page.keyboard.press('Control+Shift+KeyH')
    await expect(page.getByRole('textbox', { name: weekName })).toBeFocused()
    await page.keyboard.type('.')
    await savedOnServer(page, `week/${monday}`, 'Plan ahead.')
  })

  await test.step('a day clicked in the week strip continues where you left off', async () => {
    await revealButtons(page)
    const strip = page.getByRole('navigation', { name: 'Week' })
    await strip
      .getByRole('link', { name: new RegExp(`^Fri ${String(Number(friday.slice(8)))}`) })
      .click()
    await expect(dayPage(page, friday)).toBeFocused()
    await page.keyboard.type('!')
    await savedOnServer(page, `day/${friday}`, 'Friday!')
  })
})
