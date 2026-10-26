import type { User } from '@agendina/contract'
import { describe, expect, it } from 'vitest'
import {
  FEATURES,
  enabledFeatures,
  everythingEnabled,
  type EntitlementPolicy,
} from './entitlements.ts'

const user: User = { id: 'u1', email: 'a@example.com', role: 'member' }

describe('entitlements', () => {
  it('enables every feature by default (self-hosting)', () => {
    for (const feature of FEATURES) expect(everythingEnabled.isEnabled(user, feature)).toBe(true)
    expect(enabledFeatures(everythingEnabled, user)).toEqual([...FEATURES])
  })

  it('lets a policy gate features per user', () => {
    const [first, ...rest] = FEATURES
    const policy: EntitlementPolicy = { isEnabled: (_, feature) => feature !== first }

    expect(enabledFeatures(policy, user)).toEqual(rest)
  })
})
