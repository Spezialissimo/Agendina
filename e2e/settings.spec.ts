import { addDays } from '@agendina/core'
import { expect, test } from '@playwright/test'
import { enterAs, savedOnServer } from './helpers.ts'

test('settings: week start, and downloading every page', async ({ page }, testInfo) => {
  // Its own account per run (retries, --repeat-each): the week start is an account-wide setting.
  const monday = '2027-03-01'
  await enterAs(
    page,
    `settings-${String(testInfo.retry)}-${String(testInfo.repeatEachIndex)}@example.com`,
  )
  const weekPage = page.getByRole('textbox', { name: /^Week \d+$/ })

  await test.step('a week page written with Monday weeks', async () => {
    await page.goto(`/day/${addDays(monday, 1)}`)
    await weekPage.click()
    await page.keyboard.type('Plans for the week')
    await savedOnServer(page, `week/${monday}`, 'Plans for the week')
  })

  await test.step('weeks start on Sunday, and the page is still there', async () => {
    await page.getByRole('button', { name: 'Settings' }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('combobox', { name: 'Weeks start on' }).selectOption('Sunday')
    await page.keyboard.press('Escape')

    const days = page.getByRole('navigation', { name: 'Week' }).getByRole('link')
    await expect(days.first()).toHaveAccessibleName(/^Sun /)
    await expect(weekPage).toContainText('Plans for the week')

    await page.reload()
    await expect(days.first()).toHaveAccessibleName(/^Sun /)
    await expect(weekPage).toContainText('Plans for the week')
  })

  await test.step('all pages download as a zip of markdown files', async () => {
    await page.getByRole('button', { name: 'Settings' }).click()
    const downloading = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Download all pages' }).click()
    const download = await downloading

    expect(download.suggestedFilename()).toMatch(/^agendina-export-\d{4}-\d{2}-\d{2}\.zip$/)
    const path = await download.path()
    const { readFile } = await import('node:fs/promises')
    // Zip archives list their file names uncompressed.
    expect((await readFile(path)).includes(`weeks/${monday}.md`)).toBe(true)
  })
})
