import { Router } from 'express'
import { authenticate } from '../auth'
import { listUsers } from '../services/users'

export const usersRouter = Router()

usersRouter.get('/users', authenticate, (_req, res) => {
  res.json({ users: listUsers() })
})
