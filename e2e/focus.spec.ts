import { addDays } from '@agendina/core'
import { expect, test } from '@playwright/test'
import { checkbox, dayPage, enter, revealButtons, savedOnServer } from './helpers.ts'

test('focus mode dims everything but the page you are working in', async ({ page }, testInfo) => {
  // Far from the other journeys' pages, one week later per retry.
  const key = addDays('2026-12-08', 7 * testInfo.retry)
  await enter(page)
  await page.goto(`/day/${key}`)
  const day = dayPage(page, key)
  const daySection = page.locator('.page', { has: day })
  const weekSection = page.locator('.page', { has: page.getByRole('textbox', { name: /^Week / }) })
  const settings = page.getByRole('button', { name: 'Settings' })

  await test.step('typing hides the buttons and dims the rest', async () => {
    await day.click()
    await page.keyboard.type('Morning pages')
    await expect(settings).toHaveCSS('opacity', '0')
    await expect(weekSection).toHaveCSS('opacity', '0.35')
    await expect(daySection).toHaveCSS('opacity', '1')
    await expect(day).toHaveCSS('cursor', 'none')
  })

  await test.step('moving the mouse brings them back', async () => {
    await revealButtons(page)
    await expect(settings).toHaveCSS('opacity', '1')
    await expect(weekSection).toHaveCSS('opacity', '1')
    await expect(day).not.toHaveCSS('cursor', 'none')
  })

  await test.step('clicking into the other page starts it at once', async () => {
    await weekSection.getByRole('textbox').click()
    await expect(settings).toHaveCSS('opacity', '0')
    await expect(daySection).toHaveCSS('opacity', '0.35')
    await revealButtons(page)
    await day.click()
    await revealButtons(page)
  })

  await test.step('a mouse resting for 1.5 seconds with the cursor in the page starts it too', async () => {
    await day.click()
    await expect(settings).toHaveCSS('opacity', '1')
    await expect(settings).toHaveCSS('opacity', '0', { timeout: 6000 })
    await expect(day).toHaveCSS('cursor', 'none')
    await revealButtons(page)
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

  await test.step('the template pop-up pauses it, keeping Save and Cancel visible', async () => {
    await revealButtons(page)
    await settings.click()
    await page.getByRole('button', { name: 'Edit day template' }).click()
    await page.getByRole('textbox', { name: 'Day template' }).click()
    await page.keyboard.type('x')
    await expect(page.getByRole('button', { name: /^Save and apply from / })).toHaveCSS(
      'opacity',
      '1',
    )
    const cancel = page.getByRole('button', { name: 'Cancel' })
    await expect(cancel).toHaveCSS('opacity', '1')
    await expect(daySection).toHaveCSS('opacity', '1')
    await cancel.click()
  })

  await test.step('an offline status stays visible', async () => {
    await page.route('**/api/notes/**', (route) =>
      route.request().method() === 'GET' ? route.continue() : route.abort(),
    )
    await day.click()
    await page.keyboard.type(' later')
    const status = daySection.locator('.save-status')
    await expect(status).toHaveAttribute('data-status', 'offline')
    await expect(settings).toHaveCSS('opacity', '0')
    await expect(status).toHaveCSS('opacity', '1')
    await expect(daySection).toHaveCSS('opacity', '1')
  })
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true })

  test('a tap during focus mode only reveals the buttons', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Playwright has no touch emulation in desktop Firefox')
    await enter(page)
    await page.goto('/day/2026-12-01')
    const day = dayPage(page, '2026-12-01')
    const settings = page.getByRole('button', { name: 'Settings' })
    await day.click()
    await page.keyboard.type('On the tablet')
    await expect(settings).toHaveCSS('opacity', '0')

    const box = await settings.boundingBox()
    if (box === null) throw new Error('Settings has no box')
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)

    await expect(settings).toHaveCSS('opacity', '1')
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()
  })

  // Guards that a tap ticks the box exactly once and leaves the editor unfocused, in emulation. It
  // passed before the touchend handling too: it does not reproduce the on-screen keyboard bug.
  test('a tap on a checkbox ticks it once and does not focus the editor', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName === 'firefox', 'Playwright has no touch emulation in desktop Firefox')
    const key = addDays('2026-12-21', 7 * testInfo.retry)
    await enter(page)
    const text = '- [ ] Finish report\n\n| Exercise | Done |\n|---|---|\n| Squat | [ ] |'
    const put = await page.request.put(`/api/notes/day/${key}`, {
      data: { content: text, baseRevision: 0 },
    })
    expect(put.ok()).toBe(true)
    await page.goto(`/day/${key}`)
    await expect(checkbox(page, 'Finish report')).toBeVisible()
    await expect(page.locator('.cm-content').first()).not.toBeFocused()

    const tap = async (label: string) => {
      const box = await checkbox(page, label).boundingBox()
      if (box === null) throw new Error(`${label} has no box`)
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    }
    const editorHasFocus = () =>
      page
        .locator('.cm-editor:focus-within')
        .count()
        .then((n) => n > 0)

    await tap('Finish report')
    const ticked = text.replace('- [ ]', '- [x]')
    await savedOnServer(page, `day/${key}`, ticked)
    expect(await editorHasFocus()).toBe(false)

    await tap('Squat, Done')
    await savedOnServer(page, `day/${key}`, ticked.replace('| [ ] |', '| [x] |'))
    expect(await editorHasFocus()).toBe(false)
  })
})
