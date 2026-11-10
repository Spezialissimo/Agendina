import { expect, test } from '@playwright/test'
import { enterAs, revealButtons, savedOnServer } from './helpers.ts'

test('layout: edited on the pages, kept after a reload', async ({ page }, testInfo) => {
  // Its own account per run (retries, --repeat-each): the layout is an account-wide setting.
  await enterAs(
    page,
    `layout-${String(testInfo.retry)}-${String(testInfo.repeatEachIndex)}@example.com`,
  )
  // Tuesday 6 April 2027.
  await page.goto('/day/2027-04-06')
  const day = page.getByRole('textbox', { name: 'Tuesday, April 6, 2027' })
  const week = page.getByRole('textbox', { name: /^Week \d+$/ })
  const dayAfter = page.getByRole('region', { name: 'Wednesday, April 7, 2027' })
  const editor = page.getByRole('region', { name: 'Layout' })
  const panel = (name: string) => page.getByRole('group', { name: `${name} panel` })
  const editLayout = async () => {
    await revealButtons(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Edit layout' }).click()
    await expect(editor).toBeVisible()
  }

  await test.step('something written before', async () => {
    await day.click()
    await page.keyboard.type('Call the plumber')
    await savedOnServer(page, 'day/2027-04-06', 'Call the plumber')
  })

  await test.step('while editing, the pages are placeholders and there is nowhere else to go', async () => {
    await editLayout()

    await expect(day).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Week' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Settings' })).toBeHidden()
    await expect(panel('Selected week')).toBeVisible()
    await expect(panel('Selected day')).toBeVisible()
  })

  await test.step('cancelling changes nothing', async () => {
    await panel('Selected week').getByRole('button', { name: 'Delete page' }).click()
    await expect(panel('Selected week')).toBeHidden()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(week).toBeVisible()
    await expect(day).toContainText('Call the plumber')
  })

  await test.step('the week goes away, the next day comes below the day', async () => {
    await editLayout()
    await panel('Selected day').getByRole('button', { name: 'Add page below' }).click()
    await expect(panel('Day after')).toBeVisible()
    await panel('Selected week').getByRole('button', { name: 'Delete page' }).click()
    await page.getByRole('button', { name: 'Save layout' }).click()

    await expect(editor).toBeHidden()
    await expect(week).toBeHidden()
    await expect(day).toContainText('Call the plumber')
    await expect(dayAfter).toBeVisible()
    const above = await day.boundingBox()
    const below = await dayAfter.boundingBox()
    expect(above?.y).toBeLessThan(below?.y ?? 0)
  })

  await test.step('the next day is dragged above the day', async () => {
    await editLayout()
    const target = await panel('Selected day').boundingBox()
    if (target === null) throw new Error('No day panel')
    // Picked up by an empty corner: the whole page is the handle, not only its name.
    await panel('Day after').hover({ position: { x: 8, y: 8 } })
    await page.mouse.down()
    // In steps, like a hand.
    await page.mouse.move(target.x + target.width / 2, target.y + 40, { steps: 5 })
    // The day after is in the air: its empty place is above the day already.
    await expect(panel('Day after').getByRole('combobox')).toHaveCount(0)
    await page.mouse.move(target.x + target.width / 2, target.y + 30, { steps: 3 })
    await page.mouse.up()
    await expect(panel('Day after').getByRole('combobox')).toHaveCount(1)
    await page.getByRole('button', { name: 'Save layout' }).click()

    await expect(dayAfter).toBeVisible()
    const above = await dayAfter.boundingBox()
    const below = await day.boundingBox()
    expect(above?.y).toBeLessThan(below?.y ?? 0)
  })

  await test.step('it is still so after a reload', async () => {
    await expect
      .poll(async () => {
        const settings = (await (await page.request.get('/api/settings')).json()) as {
          settings: { layout: { direction?: string } }
        }
        return settings.settings.layout.direction
      })
      .toBe('column')
    await page.reload()

    await expect(day).toContainText('Call the plumber')
    await expect(dayAfter).toBeVisible()
    await expect(week).toBeHidden()
    const above = await dayAfter.boundingBox()
    const below = await day.boundingBox()
    expect(above?.y).toBeLessThan(below?.y ?? 0)
  })

  await test.step('the next day makes room for a calendar, to pick a day from', async () => {
    await editLayout()
    await panel('Day after').getByRole('combobox', { name: 'Shows' }).selectOption('Calendar')
    await expect(panel('Calendar')).toBeVisible()
    await page.getByRole('button', { name: 'Save layout' }).click()

    const calendar = page.getByRole('region', { name: 'Calendar' })
    await expect(calendar.getByText('April 2027')).toBeVisible()
    await expect(dayAfter).toBeHidden()
    await calendar.getByRole('button', { name: 'April 9, 2027' }).click()

    await expect(page.getByRole('textbox', { name: 'Friday, April 9, 2027' })).toBeVisible()
    await expect(calendar.getByRole('button', { name: 'April 9, 2027' })).toHaveAttribute(
      'aria-current',
      'date',
    )
  })
})
