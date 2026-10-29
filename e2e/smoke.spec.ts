import { expect, test } from '@playwright/test'

test('the web app loads', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Agendina')
  await expect(page.getByRole('heading', { name: 'Agendina' })).toBeVisible()
})

test('client-side routes load the web app', async ({ page }) => {
  await page.goto('/week/2026-W43')

  await expect(page.getByRole('heading', { name: 'Agendina' })).toBeVisible()
})

test('the API reports healthy', async ({ request }) => {
  const res = await request.get('/api/health')

  expect(res.ok()).toBe(true)
  expect(await res.json()).toEqual({ status: 'ok', version: 'e2e' })
})

test('serves its fonts itself and calls no other host', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Agendina' })).toBeVisible()
  // A string, not a function: the e2e project has no DOM types.
  await page.waitForFunction('document.fonts.status === "loaded"')

  const appOrigin = new URL(page.url()).origin
  expect(requests.filter((url) => !url.startsWith(appOrigin) && !url.startsWith('data:'))).toEqual(
    [],
  )
  expect(requests.some((url) => url.endsWith('.woff2'))).toBe(true)
  expect(await page.evaluate(`document.fonts.check('16px "Inter Variable"')`)).toBe(true)
})
