import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startTestServer, type TestServer } from '../test/server.ts'
import { Api, ApiError } from './client.ts'

describe('Api against the real server', () => {
  let server: TestServer
  let api: Api

  beforeEach(async () => {
    server = await startTestServer()
    await server.signup()
    api = new Api(server.fetch)
  })

  afterEach(async () => {
    await server.close()
  })

  it('returns null for a page nobody wrote yet', async () => {
    await expect(api.getNote('day', '2026-10-26')).resolves.toBeNull()
  })

  it('returns a conflict as a result, not an error', async () => {
    await api.saveNote('day', '2026-10-26', 'Run 5km', 0)
    await api.saveNote('day', '2026-10-26', 'Run 10km', 1)

    const result = await api.saveNote('day', '2026-10-26', 'Run 8km', 1)

    expect(result).toMatchObject({
      status: 'conflict',
      current: { content: 'Run 10km', revision: 2 },
      chunks: [{ type: 'conflict', base: ['Run 5km'], mine: ['Run 8km'], theirs: ['Run 10km'] }],
    })
  })

  it('raises the server’s error code', async () => {
    await expect(api.saveNote('day', '2026-10-26', 'x', 7)).rejects.toEqual(
      new ApiError(400, 'invalid_base_revision'),
    )
  })
})

describe('Api error handling', () => {
  it('copes with error pages that are not JSON, e.g. from a proxy', async () => {
    const api = new Api(() =>
      Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 })),
    )

    await expect(api.authState()).rejects.toEqual(new ApiError(502, 'http_error'))
  })

  it('rejects responses that do not match the contract', async () => {
    const api = new Api(() => Promise.resolve(Response.json({ setupRequired: 'maybe' })))

    await expect(api.authState()).rejects.toThrow()
  })
})
