import { Router } from 'express'
import { db } from '../db'
import { authenticate } from '../auth'
import { notFound } from '../errors'
import { idParams } from '../validation'
import { FEEDBACK_SELECT } from '../feedback-queries'
import type { CustomerRow, FeedbackItem } from '../types'

export const customersRouter = Router()

customersRouter.get('/customers/:id', authenticate, (req, res) => {
  const { id } = idParams.parse(req.params)
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as
    CustomerRow | undefined
  if (!customer) throw notFound('Customer not found')

  const history = db
    .prepare(`${FEEDBACK_SELECT} WHERE f.customer_id = ? ORDER BY f.created_at DESC LIMIT 8`)
    .all(id) as FeedbackItem[]

  res.json({ ...customer, history })
})
