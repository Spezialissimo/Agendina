import { addDays, ISO_WEEK, weekNumber } from '@agendina/core'
import { expect, test, type Page } from '@playwright/test'
import { checkbox, enterAs, savedOnServer } from './helpers.ts'

/** Two weeks from mid-December 2026, two weeks later per retry; each retry has its own account. */
function weeksFor(retry: number) {
  const first = addDays('2026-12-14', 14 * retry)
  const week = (key: string) => {
    const number = String(weekNumber(key, ISO_WEEK).week)
    return { key, name: `Week ${number}`, save: `Save and apply from week ${number}` }
  }
  return {
    email: `templates-${String(retry)}@example.com`,
    before: week(addDays(first, -7)),
    now: week(first),
    next: week(addDays(first, 7)),
  }
}

async function editTemplate(page: Page, kind: 'day' | 'week') {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: `Edit ${kind} template` }).click()
}

test('a week template, edited from Settings', async ({ page }, testInfo) => {
  const { email, before, now, next } = weeksFor(testInfo.retry)
  await enterAs(page, email)

  await test.step('the first template, in a pop-up; new weeks start from it', async () => {
    await page.goto(`/day/${now.key}`)
    await editTemplate(page, 'week')
    const dialog = page.getByRole('dialog', { name: 'Week template' })
    await expect(dialog).toBeVisible()
    await page.getByRole('textbox', { name: 'Week template' }).click()
    // Escape closes the slash menu first, then the pop-up (not tried here).
    await page.keyboard.type('/')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toBeHidden()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Backspace')
    await page.keyboard.type('| Exercise | Done |')
    await page.keyboard.press('Enter')
    await page.keyboard.type('|---|---|')
    await page.keyboard.press('Enter')
    await page.keyboard.type('| Squat | [ ] |')
    await page.getByRole('button', { name: now.save }).click()
    await expect(dialog).toBeHidden()

    await checkbox(page, 'Squat, Done').click()
    await savedOnServer(page, `week/${now.key}`, '| Exercise | Done |\n|---|---|\n| Squat | [x] |')

    await page.goto(`/day/${next.key}`)
    await checkbox(page, 'Squat, Done').click()
    await savedOnServer(page, `week/${next.key}`, '| Exercise | Done |\n|---|---|\n| Squat | [x] |')

    // Applied from this week on: the empty week before stays empty.
    await page.goto(`/day/${before.key}`)
    await expect(page.getByRole('textbox', { name: before.name })).toBeVisible()
    await expect(checkbox(page, 'Squat, Done')).toHaveCount(0)
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

    // The calendar of the save button floats over the pop-up, which keeps its size.
    const dialog = page.getByRole('dialog', { name: 'Week template' })
    const choose = page.getByRole('button', { name: 'Choose the first week' })
    /** The pop-up's box once it stopped changing: the editor lays its text out again on blur. */
    const settledBox = async () => {
      let last = await dialog.boundingBox()
      await expect
        .poll(
          async () => {
            const box = await dialog.boundingBox()
            const same = JSON.stringify(box) === JSON.stringify(last)
            last = box
            return same
          },
          { intervals: [200] },
        )
        .toBe(true)
      return last
    }
    // Measured once the editor has lost focus: its table then shows as a grid, a little taller.
    await choose.focus()
    await expect(checkbox(page, 'Bench, Done')).toBeVisible()
    const closed = await settledBox()
    await choose.click()
    await expect(page.getByRole('group', { name: 'Apply from week' })).toBeVisible()
    expect(await settledBox()).toEqual(closed)
    await choose.click()
    await expect(page.getByRole('group', { name: 'Apply from week' })).toBeHidden()

    await page.getByRole('button', { name: now.save }).click()

    await expect(page.getByRole('dialog', { name: 'Week template' })).toBeHidden()
    await expect(weekPage.getByText(/Template saved/)).toBeHidden()
    await expect(checkbox(page, 'Bench, Done')).toBeVisible()
    await expect(checkbox(page, 'Squat, Done')).toBeChecked()
    const updated = '| Exercise | Done |\n|---|---|\n| Squat | [x] |\n| Bench | [ ] |'
    await savedOnServer(page, `week/${now.key}`, updated)
    await savedOnServer(page, `week/${next.key}`, updated)
  })
})
