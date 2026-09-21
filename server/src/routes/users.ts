import { Router } from 'express'
import { db } from '../db'
import { authenticate } from '../auth'
import type { PublicUser } from '../types'

export const usersRouter = Router()

usersRouter.get('/users', authenticate, (_req, res) => {
  const users = db
    .prepare('SELECT id, email, name, role FROM users ORDER BY name')
    .all() as PublicUser[]
  res.json({ users })
})
