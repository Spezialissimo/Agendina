import {
  AuthState,
  ChangesResponse,
  MeResponse,
  NoteConflict,
  NoteResponse,
  SaveNoteResponse,
  SettingsResponse,
} from '@agendina/contract'
import { expect, test } from '@playwright/test'

const lines = (...ls: string[]) => ls.join('\n')

// One journey through the production build's API, as the web app will use it.
test('a first user sets up the instance and keeps a journal', async ({ request, baseURL }) => {
  const origin = { origin: baseURL ?? '' }

  // First run: the instance asks for setup; the first account becomes the admin.
  expect(AuthState.parse(await (await request.get('/api/auth/state')).json())).toMatchObject({
    setupRequired: true,
    user: null,
  })
  const signup = await request.post('/api/auth/signup', {
    data: { email: 'me@example.com', password: 'correct horse battery staple' },
  })
  expect(signup.status()).toBe(201)
  const me = MeResponse.parse(await (await request.get('/api/me')).json())
  expect(me.user.role).toBe('admin')

  // Defaults: ISO weeks and the Open planner.
  const { settings } = SettingsResponse.parse(await (await request.get('/api/settings')).json())
  expect(settings.weekRule).toEqual({ firstDay: 1, minimalDays: 4 })

  // Monday morning: the week page with the workout table, and today's page.
  const week = lines(
    '## Objectives',
    '',
    '| Exercise | Mo | We |',
    '|---|---|---|',
    '| Squat | [ ] | [ ] |',
    '| Bench | [ ] | [ ] |',
  )
  const saved = SaveNoteResponse.parse(
    await (
      await request.put('/api/notes/week/2026-10-19', { data: { content: week, baseRevision: 0 } })
    ).json(),
  )
  expect(saved.note.revision).toBe(1)

  // Two devices tick different rows from the same revision: both ticks are kept.
  await request.put('/api/notes/week/2026-10-19', {
    data: { content: week.replace('| Squat | [ ] |', '| Squat | [x] |'), baseRevision: 1 },
  })
  const merged = SaveNoteResponse.parse(
    await (
      await request.put('/api/notes/week/2026-10-19', {
        data: { content: week.replace('| Bench | [ ] |', '| Bench | [x] |'), baseRevision: 1 },
      })
    ).json(),
  )
  expect(merged).toMatchObject({ merged: true, note: { revision: 3 } })
  expect(merged.note.content).toContain('| Squat | [x] |')
  expect(merged.note.content).toContain('| Bench | [x] |')

  // Both devices edit the same line: a conflict, nothing saved.
  const conflict = await request.put('/api/notes/week/2026-10-19', {
    data: { content: merged.note.content.replace('## Objectives', '## Goals'), baseRevision: 3 },
  })
  expect(conflict.status()).toBe(200)
  const stale = await request.put('/api/notes/week/2026-10-19', {
    data: { content: merged.note.content.replace('## Objectives', '## Targets'), baseRevision: 3 },
  })
  expect(stale.status()).toBe(409)
  expect(NoteConflict.parse(await stale.json()).current.content).toContain('## Goals')

  // The changes feed tells other devices what happened.
  const feed = ChangesResponse.parse(await (await request.get('/api/changes?since=0')).json())
  expect(feed.changes.map((c) => [c.key, c.revision])).toEqual([['2026-10-19', 4]])

  // Export: a zip with the week page.
  const zip = await request.get('/api/export')
  expect(zip.headers()['content-type']).toBe('application/zip')
  expect((await zip.body()).subarray(0, 2).toString()).toBe('PK')

  // Logging out ends the session.
  expect((await request.post('/api/auth/logout', { headers: origin })).status()).toBe(204)
  expect((await request.get('/api/notes/week/2026-10-19')).status()).toBe(401)
  const login = await request.post('/api/auth/login', {
    data: { email: 'me@example.com', password: 'correct horse battery staple' },
  })
  expect(login.status()).toBe(200)
  expect(
    NoteResponse.parse(await (await request.get('/api/notes/week/2026-10-19')).json()).note
      .revision,
  ).toBe(4)
})
