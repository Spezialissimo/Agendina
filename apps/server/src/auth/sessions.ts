import { createHash, randomBytes } from 'node:crypto'
import type { User } from '@agendina/contract'
import type { Database } from '@agendina/db'

const DAY = 24 * 60 * 60 * 1000
export const SESSION_LIFETIME = 30 * DAY
/** A session used when less than this is left is extended to the full lifetime again. */
const RENEW_BELOW = 15 * DAY
const TOKEN = /^[A-Za-z0-9_-]{43}$/

/** Creates a session and returns its token. Only the token's hash is stored. */
export async function createSession(db: Database, userId: string, now: Date): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await db
    .insertInto('sessions')
    .values({
      id: hashToken(token),
      user_id: userId,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + SESSION_LIFETIME).toISOString(),
    })
    .execute()
  return token
}

/** The session's user, or undefined if the token is unknown or expired. Renews sessions in use. */
export async function findSessionUser(
  db: Database,
  token: string,
  now: Date,
): Promise<{ user: User; renewed: boolean } | undefined> {
  if (!TOKEN.test(token)) return undefined
  const id = hashToken(token)
  const row = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select(['users.id', 'users.email', 'users.role', 'sessions.expires_at'])
    .where('sessions.id', '=', id)
    .where('sessions.expires_at', '>', now.toISOString())
    .executeTakeFirst()
  if (row === undefined) return undefined

  const renewed = new Date(row.expires_at).getTime() - now.getTime() < RENEW_BELOW
  if (renewed) {
    await db
      .updateTable('sessions')
      .set({ expires_at: new Date(now.getTime() + SESSION_LIFETIME).toISOString() })
      .where('id', '=', id)
      .execute()
  }
  return { user: { id: row.id, email: row.email, role: row.role }, renewed }
}

export async function deleteSession(db: Database, token: string): Promise<void> {
  await db.deleteFrom('sessions').where('id', '=', hashToken(token)).execute()
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
