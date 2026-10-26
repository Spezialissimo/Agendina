import { argon2, randomBytes, timingSafeEqual } from 'node:crypto'

/** OWASP's recommended minimum for argon2id: 19 MiB memory, 2 passes, 1 lane. */
const DEFAULTS = { memory: 19456, passes: 2 }
const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/

/** Hashes a password as an argon2id PHC string. The parameters are stored in the hash. */
export async function hashPassword(
  password: string,
  params: { memory?: number; passes?: number } = {},
): Promise<string> {
  const { memory, passes } = { ...DEFAULTS, ...params }
  const salt = randomBytes(16)
  const hash = await derive(password, salt, { memory, passes, parallelism: 1, length: 32 })
  return `$argon2id$v=19$m=${memory},t=${passes},p=1$${b64(salt)}$${b64(hash)}`
}

/** Checks a password against a stored hash, using the hash's own parameters. Never throws. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = PHC.exec(stored)
  if (match === null) return false
  const [memory, passes, parallelism] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const salt = Buffer.from(match[4] ?? '', 'base64')
  const expected = Buffer.from(match[5] ?? '', 'base64')
  // Bounds keep a corrupted or hostile stored hash from exhausting memory or CPU.
  if (memory > 1 << 21 || passes < 1 || passes > 10 || parallelism < 1 || parallelism > 16)
    return false
  if (salt.length < 8 || expected.length < 16) return false
  try {
    const actual = await derive(password, salt, {
      memory,
      passes,
      parallelism,
      length: expected.length,
    })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function derive(
  password: string,
  salt: Buffer,
  p: { memory: number; passes: number; parallelism: number; length: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: password,
        nonce: salt,
        memory: p.memory,
        passes: p.passes,
        parallelism: p.parallelism,
        tagLength: p.length,
      },
      (error, key) => {
        if (error) reject(error)
        else resolve(key)
      },
    )
  })
}

function b64(buffer: Buffer): string {
  return buffer.toString('base64').replace(/=+$/, '')
}
