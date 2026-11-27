import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from './config'

export type AuthUser = {
  id: number
  email: string
  name: string
  role: string
}

export type AuthenticatedRequest = Request & { user: AuthUser }

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: config.jwtExpiresIn })
}

function isAuthUser(payload: unknown): payload is AuthUser {
  if (typeof payload !== 'object' || payload === null) return false
  const p = payload as Record<string, unknown>
  return (
    typeof p.id === 'number' &&
    typeof p.email === 'string' &&
    typeof p.name === 'string' &&
    typeof p.role === 'string'
  )
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!token) {
    return res.status(401).json({ error: 'Missing token' })
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret)
    if (!isAuthUser(payload)) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    ;(req as AuthenticatedRequest).user = {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    }
    next()
  } catch {
    // Never log the token or the header here.
    res.status(401).json({ error: 'Invalid token' })
  }
}
