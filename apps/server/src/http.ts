import type { User } from '@agendina/contract'
import type { Database } from '@agendina/db'
import type { EntitlementPolicy } from './entitlements.ts'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { z } from 'zod'

export interface AppEnv {
  Variables: {
    db: Database
    now: () => Date
    entitlements: EntitlementPolicy
    /** Set when the request carries a valid session. */
    user: User | undefined
    sessionToken: string | undefined
  }
}

/** Thrown by handlers; turned into `{ error: code }` with the given status. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
  ) {
    super(code)
  }
}

export async function readJson<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new ApiError(400, 'invalid_request')
  }
  return parse(schema, body)
}

/** Validates path or query parameters; a mismatch is the client's fault (400). */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiError(400, 'invalid_request')
  return result.data
}

export function requireUser(c: Context<AppEnv>): User {
  const user = c.get('user')
  if (user === undefined) throw new ApiError(401, 'unauthorized')
  return user
}
