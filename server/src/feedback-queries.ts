import { db } from './db'
import { notFound } from './errors'
import { likePattern } from './validation'
import type { FeedbackItem } from './types'

/** Feedback joined with customer and assignee — one query instead of two per row. */
export const FEEDBACK_SELECT = `
  SELECT f.id, f.customer_id, c.name AS customer_name, c.email AS customer_email,
         f.channel, f.message, f.status, f.priority, f.assignee_id,
         u.name AS assignee_name, f.due_at, f.created_at
  FROM feedback f
  JOIN customers c ON c.id = f.customer_id
  LEFT JOIN users u ON u.id = f.assignee_id`

/** Shared WHERE builder for the inbox list and the CSV export. */
export function feedbackFilters(status: string, search: string) {
  const clauses: string[] = []
  const params: unknown[] = []
  if (status !== 'all') {
    clauses.push('f.status = ?')
    params.push(status)
  }
  if (search) {
    const pattern = likePattern(search)
    clauses.push(
      `(f.message LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\')`
    )
    params.push(pattern, pattern, pattern)
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

export function getFeedbackItem(id: number): FeedbackItem {
  const row = db.prepare(`${FEEDBACK_SELECT} WHERE f.id = ?`).get(id) as FeedbackItem | undefined
  if (!row) throw notFound('Feedback not found')
  return row
}
