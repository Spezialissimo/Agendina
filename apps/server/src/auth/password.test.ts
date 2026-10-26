import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.ts'

describe('password hashing', () => {
  it('produces an argon2id hash in the standard PHC format', async () => {
    const hash = await hashPassword('correct horse battery staple')

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/)
    expect(hash).not.toContain('correct horse')
  })

  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('correct horse battery staple')

    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true)
    await expect(verifyPassword('correct horse battery stapl', hash)).resolves.toBe(false)
    await expect(verifyPassword('', hash)).resolves.toBe(false)
  })

  it('salts every hash', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'))
  })

  it('verifies hashes made with other parameters, so they can be raised later', async () => {
    const weaker = await hashPassword('correct horse battery staple', { memory: 8192, passes: 1 })

    expect(weaker).toContain('$m=8192,t=1,p=1$')
    await expect(verifyPassword('correct horse battery staple', weaker)).resolves.toBe(true)
  })

  it.each([
    '',
    'plaintext',
    '$argon2i$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
    '$argon2id$v=19$m=abc,t=2,p=1$c2FsdA$aGFzaA',
  ])('rejects the malformed hash %j instead of throwing', async (hash) => {
    await expect(verifyPassword('anything', hash)).resolves.toBe(false)
  })
})
