import { addDays } from '@agendina/core'
import { expect, test } from '@playwright/test'
import { checkbox, dayPage, enter, savedOnServer } from './helpers.ts'

/**
 * The pages this attempt writes on: from week 47 (mid-November, away from the other journey), one
 * week later per retry, so a retry never builds on what a failed attempt left on the server.
 */
function pagesFor(retry: number) {
  const monday = addDays('2026-11-16', 7 * retry)
  return {
    day: addDays(monday, 1),
    week: monday,
    weekName: `Week ${String(47 + retry)}`,
  }
}

test('writing with the editor', async ({ page }, testInfo) => {
  const pages = pagesFor(testInfo.retry)
  const DAY = pages.day
  await enter(page)
  await page.goto(`/day/${DAY}`)
  const day = dayPage(page, DAY)
  const week = page.getByRole('textbox', { name: pages.weekName })

  await test.step('live preview: markdown renders once you leave the line', async () => {
    await day.click()
    await page.keyboard.type('## Goals')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Call **the dentist**')
    await week.click()

    await expect(day.locator('.cm-line.cm-h2')).toHaveText('Goals')
    await expect(day.locator('.cm-strong')).toHaveText('the dentist')
  })

  await test.step('⌘↩ turns a line into a to-do, clicking ticks it', async () => {
    await day.locator('.cm-line', { hasText: 'Call' }).click()
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(checkbox(page, 'Call **the dentist**')).toBeVisible()

    await checkbox(page, 'Call **the dentist**').click()
    await savedOnServer(page, `day/${DAY}`, '## Goals\n- [x] Call **the dentist**')
  })

  await test.step('the slash menu inserts a week tracker; its cells tick in the grid', async () => {
    await week.click()
    await page.keyboard.type('/week')
    // Clicked rather than Enter: CodeMirror ignores Enter for 75 ms after the menu changes, which
    // a slow CI machine can hit.
    await page.getByRole('option', { name: /Week tracker/ }).click()
    await page.keyboard.type('Run')
    await day.click()

    await checkbox(page, 'Run, We').click()
    await savedOnServer(page, `week/${pages.week}`, /\| Run +\| \[ \] \| \[ \] \| \[x\] \|/)
  })

  await test.step('Tab moves through the table; the palette adds a column', async () => {
    await week.locator('.cm-table-widget td', { hasText: 'Run' }).click()
    await page.keyboard.press('Tab')
    await page.keyboard.press('ControlOrMeta+KeyK')
    await page.getByRole('combobox', { name: 'Search commands' }).fill('add table column')
    await page.keyboard.press('Enter')

    // Inserted right after "Mo", with a checkbox in the Run row.
    await savedOnServer(
      page,
      `week/${pages.week}`,
      /\| +\| Mo +\| +\| Tu +\|[\s\S]*\| Run +\| \[ \] \| \[ \] \| \[ \] \|/,
    )
  })
})
