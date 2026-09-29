import { db } from '../db'
import { notFound } from '../errors'
import { FEEDBACK_SELECT } from './feedback-queries'
import type { CustomerRow, FeedbackItem } from '../types'

const HISTORY_LIMIT = 8

export type CustomerWithHistory = CustomerRow & { history: FeedbackItem[] }

export function getCustomerWithHistory(id: number): CustomerWithHistory {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as
    | CustomerRow
    | undefined
  if (!customer) throw notFound('Customer not found')

  const history = db
    .prepare(`${FEEDBACK_SELECT} WHERE f.customer_id = ? ORDER BY f.created_at DESC LIMIT ?`)
    .all(id, HISTORY_LIMIT) as FeedbackItem[]

  return { ...customer, history }
}
