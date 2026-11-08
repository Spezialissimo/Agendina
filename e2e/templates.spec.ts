import { addDays, ISO_WEEK, weekNumber } from '@agendina/core'
import { expect, test, type Page } from '@playwright/test'
import { checkbox, enterAs, revealButtons, savedOnServer } from './helpers.ts'

/** Two weeks from mid-December 2026, two weeks later per retry; each retry has its own account. */
function weeksFor(retry: number) {
  const first = addDays('2026-12-14', 14 * retry)
  const week = (key: string) => ({ key, name: `Week ${String(weekNumber(key, ISO_WEEK).week)}` })
  return {
    email: `templates-${String(retry)}@example.com`,
    now: week(first),
    next: week(addDays(first, 7)),
  }
}

async function editTemplate(page: Page, kind: 'day' | 'week') {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: `Edit ${kind} template` }).click()
}

test('a week template, edited from Settings', async ({ page }, testInfo) => {
  const { email, now, next } = weeksFor(testInfo.retry)
  await enterAs(page, email)

  await test.step('the first template starts from the page, new weeks start from it', async () => {
    await page.goto(`/day/${now.key}`)
    await editTemplate(page, 'week')
    await page.getByRole('textbox', { name: 'Week template' }).click()
    await page.keyboard.type('| Exercise | Done |')
    await page.keyboard.press('Enter')
    await page.keyboard.type('|---|---|')
    await page.keyboard.press('Enter')
    await page.keyboard.type('| Squat | [ ] |')
    await page.getByRole('button', { name: 'Save template' }).click()

    await checkbox(page, 'Squat, Done').click()
    await savedOnServer(page, `week/${now.key}`, '| Exercise | Done |\n|---|---|\n| Squat | [x] |')

    await page.goto(`/day/${next.key}`)
    await checkbox(page, 'Squat, Done').click()
    await savedOnServer(page, `week/${next.key}`, '| Exercise | Done |\n|---|---|\n| Squat | [x] |')
  })

  await test.step('a template change reaches this and later pages, keeping the ticks', async () => {
    await page.goto(`/day/${now.key}`)
    const weekPage = page.getByRole('region', { name: now.name })
    await editTemplate(page, 'week')
    const template = page.getByRole('textbox', { name: 'Week template' })
    // The editor opens focused with the cursor in the table, which then shows as text, not a grid.
    await expect(template).toBeFocused()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('| Bench | [ ] |')
    await revealButtons(page)
    await page.getByRole('button', { name: 'Save template' }).click()

    await expect(weekPage.getByText('Template saved, 2 pages updated.')).toBeVisible()
    await expect(checkbox(page, 'Bench, Done')).toBeVisible()
    await expect(checkbox(page, 'Squat, Done')).toBeChecked()
    const updated = '| Exercise | Done |\n|---|---|\n| Squat | [x] |\n| Bench | [ ] |'
    await savedOnServer(page, `week/${now.key}`, updated)
    await savedOnServer(page, `week/${next.key}`, updated)
  })
})
