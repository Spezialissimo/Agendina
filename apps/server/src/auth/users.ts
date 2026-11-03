import { randomUUID } from 'node:crypto'
import type { User } from '@agendina/contract'
import type { Database } from '@agendina/db'
import { ApiError } from '../http.ts'

const ADMIN_CLAIM = 'admin_user_id'
const SIGNUP_OPEN = 'signup_open'

/**
 * Creates an account. The first account becomes the admin: claiming a unique settings row inside
 * the transaction guarantees a single admin even when several first signups race.
 */
export async function createUser(
  db: Database,
  email: string,
  passwordHash: string,
  now: Date,
): Promise<User> {
  const id = randomUUID()
  try {
    return await db.transaction().execute(async (trx) => {
      const claim = await trx
        .insertInto('instance_settings')
        .values({ key: ADMIN_CLAIM, value: JSON.stringify(id) })
        .onConflict((oc) => oc.column('key').doNothing())
        .executeTakeFirst()
      const isFirst = Number(claim.numInsertedOrUpdatedRows ?? 0) === 1
      if (!isFirst && !(await isSignupOpen(trx))) throw new ApiError(403, 'signup_closed')

      const role = isFirst ? 'admin' : 'member'
      await trx
        .insertInto('users')
        .values({ id, email, password_hash: passwordHash, role, created_at: now.toISOString() })
        .execute()
      return { id, email, role }
    })
  } catch (error) {
    // A taken email fails the unique constraint. The lookup runs outside the transaction, which
    // Postgres has aborted by then.
    if (!(error instanceof ApiError)) {
      const taken = await db
        .selectFrom('users')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirst()
      if (taken !== undefined) throw new ApiError(409, 'email_taken')
    }
    throw error
  }
}

export async function isSignupOpen(db: Pick<Database, 'selectFrom'>): Promise<boolean> {
  const row = await db
    .selectFrom('instance_settings')
    .select('value')
    .where('key', '=', SIGNUP_OPEN)
    .executeTakeFirst()
  return row !== undefined && JSON.parse(row.value) === true
}

export async function setSignupOpen(db: Database, open: boolean): Promise<void> {
  const value = JSON.stringify(open)
  await db
    .insertInto('instance_settings')
    .values({ key: SIGNUP_OPEN, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute()
}
