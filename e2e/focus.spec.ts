import { expect, test } from '@playwright/test'
import { enter, revealButtons } from './helpers.ts'

test('focus mode dims everything but the page you are working in', async ({ page }, testInfo) => {
  // Far from the other journeys' pages, one week later per retry.
  const date = 8 + 7 * testInfo.retry
  await enter(page)
  await page.goto(`/day/2026-12-${String(date).padStart(2, '0')}`)
  const day = page.getByRole('textbox', {
    name: new RegExp(`December ${String(date)}, 2026|${String(date)} December 2026`),
  })
  const dayPage = page.locator('.page', { has: day })
  const weekPage = page.locator('.page', { has: page.getByRole('textbox', { name: /^Week / }) })
  const settings = page.getByRole('button', { name: 'Settings' })

  await test.step('typing hides the buttons and dims the rest', async () => {
    await day.click()
    await page.keyboard.type('Morning pages')
    await expect(settings).toHaveCSS('opacity', '0')
    await expect(weekPage).toHaveCSS('opacity', '0.35')
    await expect(dayPage).toHaveCSS('opacity', '1')
  })

  await test.step('moving the mouse brings them back', async () => {
    await revealButtons(page)
    await expect(settings).toHaveCSS('opacity', '1')
    await expect(weekPage).toHaveCSS('opacity', '1')
  })

  await test.step('Escape closes the slash menu first', async () => {
    await day.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(page.getByRole('listbox')).toBeVisible()
    await expect(settings).toHaveCSS('opacity', '0')

    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toBeHidden()
    await expect(settings).toHaveCSS('opacity', '0')

    await page.keyboard.press('Escape')
    await expect(settings).toHaveCSS('opacity', '1')
    await expect(day).toBeFocused()
    await page.keyboard.press('Backspace')
  })

  await test.step('leaving the editor with the keyboard reveals the button it lands on', async () => {
    await day.click()
    await page.keyboard.press('ArrowLeft')
    await expect(settings).toHaveCSS('opacity', '0')
    await settings.focus()
    await expect(settings).toHaveCSS('opacity', '1')
  })

  await test.step('the template editor keeps Save and Cancel visible', async () => {
    await revealButtons(page)
    await dayPage.getByRole('button', { name: 'Edit day template' }).click()
    await page.getByRole('textbox', { name: 'Day template' }).click()
    await page.keyboard.type('x')
    await expect(settings).toHaveCSS('opacity', '0')
    const cancel = page.getByRole('button', { name: 'Cancel' })
    await expect(cancel).toHaveCSS('opacity', '1')
    await cancel.click()
  })

  await test.step('an offline status stays visible', async () => {
    await page.route('**/api/notes/**', (route) =>
      route.request().method() === 'GET' ? route.continue() : route.abort(),
    )
    await day.click()
    await page.keyboard.type(' later')
    const status = dayPage.locator('.save-status')
    await expect(status).toHaveAttribute('data-status', 'offline')
    await expect(settings).toHaveCSS('opacity', '0')
    await expect(status).toHaveCSS('opacity', '1')
    await expect(dayPage).toHaveCSS('opacity', '1')
  })
})
