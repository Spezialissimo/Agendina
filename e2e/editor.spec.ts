import { expect, test } from '@playwright/test'
import { checkbox, enter, savedOnServer } from './helpers.ts'

// Mid-November, so these pages never meet the other journey's (late October).
const DAY = '2026-11-17'

test('writing with the editor', async ({ page }) => {
  await enter(page)
  await page.goto(`/day/${DAY}`)
  const day = page.getByRole('textbox', { name: /November 17, 2026|17 November 2026/ })
  const week = page.getByRole('textbox', { name: 'Week 47' })

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
    await expect(page.getByRole('option', { name: /Week tracker/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await page.keyboard.type('Run')
    await day.click()

    await checkbox(page, 'Run, We').click()
    await savedOnServer(page, 'week/2026-11-16', /\| Run +\| \[ \] \| \[ \] \| \[x\] \|/)
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
      'week/2026-11-16',
      /\| +\| Mo +\| +\| Tu +\|[\s\S]*\| Run +\| \[ \] \| \[ \] \| \[ \] \|/,
    )
  })
})
