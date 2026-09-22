import { Router } from 'express'
import { db } from '../db'
import { authenticate } from '../auth'
import { exportQuery } from '../validation'
import { feedbackFilters } from '../feedback-queries'
import type { FeedbackItem } from '../types'

/**
 * Quote a CSV cell. Doubles quotes, and prefixes a tab when the value starts with a
 * character spreadsheets treat as a formula (`=`, `+`, `-`, `@`) or a control character —
 * `=HYPERLINK(...)` in a customer message must open as text, not execute.
 */
export function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `\t${text}`
  }
  return `"${text.replace(/"/g, '""')}"`
}

const HEADER = [
  'id',
  'customer',
  'email',
  'plan',
  'channel',
  'priority',
  'status',
  'assignee',
  'due_at',
  'message',
  'shared_notes',
]

type ExportRow = FeedbackItem & { plan: string; shared_notes: string | null }

export const exportRouter = Router()

exportRouter.get('/export.csv', authenticate, (req, res) => {
  const { status, q } = exportQuery.parse(req.query)
  const { where, params } = feedbackFilters(status, q)

  // Private notes never leave the system.
  const rows = db
    .prepare(
      `SELECT f.*, c.name AS customer_name, c.email AS customer_email, c.plan, u.name AS assignee_name,
        (SELECT GROUP_CONCAT(body, ' | ') FROM feedback_notes
           WHERE feedback_id = f.id AND is_private = 0) AS shared_notes
       FROM feedback f
       JOIN customers c ON c.id = f.customer_id
       LEFT JOIN users u ON u.id = f.assignee_id
       ${where}
       ORDER BY f.created_at DESC`
    )
    .all(...params) as ExportRow[]

  const lines = [
    HEADER.join(','),
    ...rows.map((row) =>
      [
        row.id,
        row.customer_name,
        row.customer_email,
        row.plan,
        row.channel,
        row.priority,
        row.status,
        row.assignee_name,
        row.due_at,
        row.message,
        row.shared_notes,
      ]
        .map(csvCell)
        .join(',')
    ),
  ]

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="pulse-feedback-export.csv"')
  res.send(lines.join('\n'))
})
