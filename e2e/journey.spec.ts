import { expect, test } from '@playwright/test'
import { checkbox, dayPage, enter, localToday, savedOnServer } from './helpers.ts'

test('a week of journaling', async ({ page }) => {
  const week = page.getByRole('textbox', { name: 'Week 44' })
  const monday = dayPage(page, '2026-10-26')
  const tuesday = dayPage(page, '2026-10-27')

  await test.step('first run: create the admin account and land on today', async () => {
    await enter(page)
    await expect(page).toHaveURL(new RegExp(`/day/${localToday()}$`))
  })

  await test.step('write the week and day pages; they are still there after a reload', async () => {
    const weekText =
      '## Objectives\n- [ ] Ship the MVP\n\n| Exercise | Mo | We |\n|---|---|---|\n| Squat | [x] | [ ] |'
    const dayText = '- [ ] Finish report\n- [x] Call dentist'
    await page.goto('/day/2026-10-26')
    await week.fill(weekText)
    await monday.fill(dayText)
    await savedOnServer(page, 'week/2026-10-26', weekText)
    await savedOnServer(page, 'day/2026-10-26', dayText)

    await page.reload()
    await expect(week).toContainText('Ship the MVP')
    await expect(monday).toContainText('Call dentist')
    // Checkbox cells of the workout table render as checkboxes; ticking one saves the page.
    await expect(checkbox(page, 'Squat, Mo')).toBeChecked()
    await expect(checkbox(page, 'Squat, We')).not.toBeChecked()
    await checkbox(page, 'Squat, We').click()
    await expect(checkbox(page, 'Squat, We')).toBeChecked()
    await savedOnServer(
      page,
      'week/2026-10-26',
      weekText.replace('| Squat | [x] | [ ] |', '| Squat | [x] | [x] |'),
    )
    await expect(page.getByRole('link', { name: /^Mon 26.*written/ })).toBeVisible()
  })

  await test.step('move through the week with the strip and the shortcuts', async () => {
    await page.getByRole('link', { name: /^Thu 29/ }).click()
    await expect(page).toHaveURL(/\/day\/2026-10-29$/)
    // Pressed immediately after the click: must act on Thursday, not on the previous day.
    await page.keyboard.press('ControlOrMeta+Shift+Comma')
    await expect(page).toHaveURL(/\/day\/2026-10-28$/)
    await page.keyboard.press('ControlOrMeta+Alt+Shift+Period')
    await expect(page).toHaveURL(/\/day\/2026-11-04$/)
    await page.keyboard.press('ControlOrMeta+Alt+KeyT')
    await expect(page).toHaveURL(new RegExp(`/day/${localToday()}$`))
  })

  await test.step('run a command from the palette', async () => {
    await page.goto('/day/2026-10-26')
    await expect(page.getByRole('navigation', { name: 'Week' })).toBeVisible()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await page.getByRole('combobox', { name: 'Search commands' }).fill('next week')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/day\/2026-11-02$/)
  })

  await test.step('resolve a conflict with another device', async () => {
    await page.goto('/day/2026-10-27')
    await tuesday.fill('Run 5km')
    const revision = await savedOnServer(page, 'day/2026-10-27', 'Run 5km')

    // The phone (same account) changes the same line.
    await page.request.put('/api/notes/day/2026-10-27', {
      data: { content: 'Run 10km', baseRevision: revision },
    })
    await tuesday.fill('Run 8km')

    const resolver = page.getByRole('group', { name: 'This page changed elsewhere' })
    await expect(resolver).toBeVisible()
    await resolver.getByRole('radio', { name: /Keep mine/ }).check()
    await resolver.getByRole('button', { name: 'Save' }).click()

    await expect(tuesday).toHaveText('Run 8km')
    await savedOnServer(page, 'day/2026-10-27', 'Run 8km')
  })

  await test.step('sign out from the palette', async () => {
    await page.keyboard.press('ControlOrMeta+KeyK')
    await page.getByRole('combobox', { name: 'Search commands' }).fill('sign out')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })
})
