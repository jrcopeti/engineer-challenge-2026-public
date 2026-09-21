import jwt from 'jsonwebtoken'
import { app } from '../src/app'
import { db } from '../src/db'
import { seedDatabase } from '../src/seed-data'
import { signToken } from '../src/auth'

export { app, db }

export function resetDb() {
  seedDatabase(db)
}

/** Seeded users (see seed-data.ts). */
export const ALICE = { id: 1, email: 'alice@pulse.test', name: 'Alice Martin', role: 'agent' }
export const ALICE_PASSWORD = 'password123'

export function tokenFor(user = ALICE) {
  return signToken(user)
}

export function bearer(user = ALICE) {
  return { Authorization: `Bearer ${tokenFor(user)}` }
}

/** A token with a valid shape but signed with the wrong key. */
export function forgedToken(user = ALICE) {
  return jwt.sign(user, 'not-the-server-secret')
}

/** A token with no signature at all (alg=none). */
export function unsignedToken(user = ALICE) {
  return jwt.sign(user, '', { algorithm: 'none' })
}
