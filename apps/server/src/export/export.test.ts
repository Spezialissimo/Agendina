import { testDatabases } from '@agendina/db/testing'
import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { useSignedInServer } from '../testing.ts'

describe.each(testDatabases())('export on $kind', ({ create }) => {
  const t = useSignedInServer(create)

  const save = async (kind: string, key: string, content: string, as = t.cookie) => {
    await t.server.saveNote(kind, key, { content, baseRevision: 0 }, as)
  }
  const exportZip = async (as = t.cookie) => {
    const res = await t.server.request('/api/export', { cookie: as })
    expect(res.status).toBe(200)
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
    return {
      res,
      files: Object.fromEntries(
        Object.entries(files).map(([name, data]) => [name, strFromU8(data)]),
      ),
    }
  }

  it('downloads a dated zip file', async () => {
    const { res } = await exportZip()

    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="agendina-export-2026-10-26.zip"',
    )
  })

  it('contains every day and week page as markdown, exactly as written', async () => {
    const day = '- [x] Città 🏋️\r\ntrailing   \n'
    const week = '| Squat | [x] | [ ] |\n'
    await save('day', '2026-10-26', day)
    await save('week', '2026-10-19', week)

    const { files } = await exportZip()

    expect(files).toEqual({ 'days/2026-10-26.md': day, 'weeks/2026-10-19.md': week })
  })

  it('contains the templates, so a backup restores the pre-printed pages too', async () => {
    await t.server.request('/api/templates/week', {
      method: 'PUT',
      cookie: t.cookie,
      body: { content: '## Objectives', baseRevision: 0 },
    })

    const { files } = await exportZip()

    expect(files).toEqual({ 'templates/week.md': '## Objectives' })
  })

  it('leaves out deleted pages', async () => {
    await save('day', '2026-10-25', 'kept')
    await save('day', '2026-10-26', 'deleted')
    await t.server.request('/api/notes/day/2026-10-26?baseRevision=1', {
      method: 'DELETE',
      cookie: t.cookie,
    })

    const { files } = await exportZip()

    expect(Object.keys(files)).toEqual(['days/2026-10-25.md'])
  })

  it('contains only the signed-in user’s pages', async () => {
    await t.server.request('/api/admin/settings', {
      method: 'PUT',
      cookie: t.cookie,
      body: { signupOpen: true },
    })
    const other = await t.server.signup('other@example.com')
    await save('day', '2026-10-26', 'mine')

    expect((await exportZip(other)).files).toEqual({})
  })

  it('requires a signed-in user', async () => {
    expect((await t.server.request('/api/export')).status).toBe(401)
  })
})
