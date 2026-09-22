import { Router } from 'express'
import { db } from '../db'
import { authenticate } from '../auth'
import { metricsQuery } from '../validation'
import type { CountRow } from '../types'

export const metricsRouter = Router()

metricsRouter.get('/metrics', authenticate, (req, res) => {
  const query = metricsQuery.parse(req.query)
  const from = query.from ?? '1970-01-01T00:00:00.000Z'
  const to = query.to ?? new Date().toISOString()

  const byStatus = db
    .prepare(
      'SELECT status, COUNT(*) AS count FROM feedback WHERE created_at >= ? AND created_at <= ? GROUP BY status'
    )
    .all(from, to) as Array<{ status: string; count: number }>
  const urgent = db
    .prepare(
      "SELECT COUNT(*) AS count FROM feedback WHERE priority = 'urgent' AND created_at >= ? AND created_at <= ?"
    )
    .get(from, to) as CountRow
  const overdue = db
    .prepare("SELECT COUNT(*) AS count FROM feedback WHERE status = 'open' AND due_at < ?")
    .get(new Date().toISOString()) as CountRow

  res.json({
    open: byStatus.find((r) => r.status === 'open')?.count ?? 0,
    resolved: byStatus.find((r) => r.status === 'resolved')?.count ?? 0,
    urgent: urgent.count,
    overdue: overdue.count,
  })
})
