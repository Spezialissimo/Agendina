import type { User } from '@agendina/contract'

/**
 * Features that may be gated per user (e.g. on a hosted plan). Nothing is gated yet: the free/paid
 * split is decided before public launch (ADR 0006). Self-hosted instances enable everything.
 */
export const FEATURES = ['custom-layouts', 'version-history'] as const
type Feature = (typeof FEATURES)[number]

export interface EntitlementPolicy {
  isEnabled(user: User, feature: Feature): boolean
}

export const everythingEnabled: EntitlementPolicy = { isEnabled: () => true }

export function enabledFeatures(policy: EntitlementPolicy, user: User): Feature[] {
  return FEATURES.filter((feature) => policy.isEnabled(user, feature))
}
