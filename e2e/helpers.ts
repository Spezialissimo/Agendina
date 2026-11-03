import { NoteResponse } from '@agendina/contract'
import { dayKey } from '@agendina/core'
import { expect, type Page } from '@playwright/test'

const EMAIL = 'journal@example.com'
const PASSWORD = 'correct horse battery staple'

/** Today in the browser's (= this machine's) time zone, as the app computes it. */
export function localToday(): string {
  const now = new Date()
  return dayKey(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** The editor of the day page `key`, named by its long date: en-US or en-GB, as browsers differ. */
export function dayPage(page: Page, key: string) {
  const options = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } as const
  const names = ['en-US', 'en-GB'].map((locale) =>
    new Intl.DateTimeFormat(locale, options).format(new Date(`${key}T00:00:00Z`)),
  )
  return page.getByRole('textbox', { name: new RegExp(`\\b(?:${names.join('|')})\\b`) })
}

/** Waits until the server holds `content` for a page (autosave is debounced); returns its revision. */
export async function savedOnServer(
  page: Page,
  path: string,
  content: string | RegExp,
): Promise<number> {
  let revision = 0
  await expect(async () => {
    const res = await page.request.get(`/api/notes/${path}`)
    expect(res.status()).toBe(200)
    const { note } = NoteResponse.parse(await res.json())
    if (typeof content === 'string') expect(note.content).toBe(content)
    else expect(note.content).toMatch(content)
    revision = note.revision
  }).toPass()
  return revision
}

/** A checkbox inside a page editor, by its label ("Finish report", or "Squat, Mo" in a table). */
export function checkbox(page: Page, label: string) {
  return page.locator(`input.cm-checkbox[aria-label="${label}"]`)
}

/**
 * Signs in to this project's server, creating the account if the instance is new. Specs of one
 * project run in parallel on the same server, so two may race to create it: the loser signs in
 * (it sees "Signup is closed", or, once `enterAs` opened signup, "already exists").
 */
export async function enter(page: Page) {
  await page.goto('/')
  const welcome = page.getByRole('heading', { name: 'Welcome to Agendina' })
  const signIn = page.getByRole('button', { name: 'Sign in' })
  const planner = page.getByRole('navigation', { name: 'Week' })
  await expect(welcome.or(signIn)).toBeVisible()
  if (await welcome.isVisible()) {
    await page.getByLabel('Email').fill(EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Repeat password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    const closed = page
      .getByRole('alert')
      .filter({ hasText: /Signup is closed|account with this email already exists/ })
    await expect(planner.or(closed)).toBeVisible()
    if (await planner.isVisible()) return
    await page.goto('/')
  }
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await signIn.click()
  await expect(planner).toBeVisible()
}

/**
 * Signs in as a separate account, for journeys that change account-wide things (templates) that
 * would show up in the other journeys running in parallel. The admin opens signup for it.
 */
export async function enterAs(page: Page, email: string) {
  await enter(page)
  const headers = { origin: new URL(page.url()).origin }
  const credentials = { email, password: PASSWORD }
  expect(
    (await page.request.put('/api/admin/settings', { data: { signupOpen: true }, headers })).ok(),
  ).toBe(true)
  await page.request.post('/api/auth/logout', { headers })
  const signup = await page.request.post('/api/auth/signup', { data: credentials, headers })
  if (!signup.ok()) {
    expect((await page.request.post('/api/auth/login', { data: credentials, headers })).ok()).toBe(
      true,
    )
  }
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Week' })).toBeVisible()
}

/**
 * Moves the mouse, as a person does before clicking. While typing, focus mode hides the buttons and
 * only a moving mouse brings them back; Playwright's click would not move it onto a hidden button.
 */
export async function revealButtons(page: Page) {
  await page.mouse.move(400, 300)
  await page.mouse.move(420, 320)
}
