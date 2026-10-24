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
