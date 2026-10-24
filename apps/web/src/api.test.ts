import { describe, expect, it } from 'vitest'
import { ApiError, getHealth } from './api.ts'

describe('getHealth', () => {
  it('returns the parsed health response', async () => {
    const fetchFn = stubFetch(200, { status: 'ok', version: '0.1.0' })

    await expect(getHealth(fetchFn)).resolves.toEqual({ status: 'ok', version: '0.1.0' })
    expect(fetchFn.calls).toEqual(['/api/health'])
  })

  it('rejects responses that do not match the contract', async () => {
    const fetchFn = stubFetch(200, { status: 'maybe' })

    await expect(getHealth(fetchFn)).rejects.toThrow()
  })

  it('rejects non-2xx responses with an ApiError carrying the status', async () => {
    const fetchFn = stubFetch(503, { error: 'unavailable' })

    await expect(getHealth(fetchFn)).rejects.toEqual(new ApiError(503))
  })
})

function stubFetch(status: number, body: unknown) {
  const calls: string[] = []
  const fn = (input: string) => {
    calls.push(input)
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
  return Object.assign(fn, { calls })
}
