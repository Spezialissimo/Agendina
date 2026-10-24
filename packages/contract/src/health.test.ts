import { describe, expect, it } from 'vitest'
import { HealthResponse } from './health.ts'

describe('HealthResponse', () => {
  it('accepts an ok status with a version', () => {
    expect(HealthResponse.safeParse({ status: 'ok', version: '1.0.0' }).success).toBe(true)
  })

  it.each([{ status: 'down', version: '1.0.0' }, { status: 'ok' }, null])('rejects %j', (value) => {
    expect(HealthResponse.safeParse(value).success).toBe(false)
  })
})
