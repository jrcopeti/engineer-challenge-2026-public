import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb, ALICE, ALICE_PASSWORD } from '../helpers'
import { login } from '../../src/services/auth'
import { HttpError } from '../../src/errors'

describe('login', () => {
  beforeAll(() => resetDb())

  it('returns a token and the user without the password hash', async () => {
    const { token, user } = await login(ALICE.email, ALICE_PASSWORD)
    expect(typeof token).toBe('string')
    expect(user).toEqual(ALICE)
    expect(user).not.toHaveProperty('password_hash')
  })

  // Same error either way, so the response never reveals which emails exist.
  it('rejects a wrong password and an unknown email identically', async () => {
    const wrongPassword = await login(ALICE.email, 'not-the-password').catch((e) => e)
    const unknownEmail = await login('nobody@pulse.test', ALICE_PASSWORD).catch((e) => e)

    for (const err of [wrongPassword, unknownEmail]) {
      expect(err).toBeInstanceOf(HttpError)
      expect((err as HttpError).status).toBe(401)
      expect((err as HttpError).message).toBe('Invalid email or password')
    }
  })
})
