import bcrypt from 'bcryptjs'
import { db } from '../db'
import { signToken } from '../auth'
import { HttpError } from '../errors'
import type { PublicUser, UserRow } from '../types'

// Compared against when the email is unknown, so response time does not reveal
// whether an account exists. Cost matches production user hashes.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: PublicUser }> {
  const user = db
    .prepare('SELECT id, email, password_hash, name, role FROM users WHERE email = ?')
    .get(email) as UserRow | undefined

  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
  if (!user || !ok) {
    throw new HttpError(401, 'Invalid email or password')
  }

  const publicUser: PublicUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  }
  return { token: signToken(publicUser), user: publicUser }
}
