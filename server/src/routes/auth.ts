import { Router } from 'express'
import { asyncHandler } from '../errors'
import { loginBody } from '../validation'
import { login } from '../services/auth'

export const authRouter = Router()

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginBody.parse(req.body)
    res.json(await login(email, password))
  })
)
