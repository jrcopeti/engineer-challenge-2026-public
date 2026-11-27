import { db } from '../db'
import type { PublicUser } from '../types'

export function listUsers(): PublicUser[] {
  return db.prepare('SELECT id, email, name, role FROM users ORDER BY name').all() as PublicUser[]
}
