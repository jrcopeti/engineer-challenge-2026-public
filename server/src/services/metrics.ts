import { db } from '../db'
import type { CountRow } from '../types'

const EPOCH = '1970-01-01T00:00:00.000Z'

export type Metrics = { open: number; resolved: number; urgent: number; overdue: number }

export function getMetrics({ from, to }: { from?: string; to?: string }): Metrics {
  const start = from ?? EPOCH
  const end = to ?? new Date().toISOString()

  const byStatus = db
    .prepare(
      'SELECT status, COUNT(*) AS count FROM feedback WHERE created_at >= ? AND created_at <= ? GROUP BY status'
    )
    .all(start, end) as Array<{ status: string; count: number }>
  const urgent = db
    .prepare(
      "SELECT COUNT(*) AS count FROM feedback WHERE priority = 'urgent' AND created_at >= ? AND created_at <= ?"
    )
    .get(start, end) as CountRow
  // Overdue is "open and past due right now", deliberately outside the reporting window.
  const overdue = db
    .prepare("SELECT COUNT(*) AS count FROM feedback WHERE status = 'open' AND due_at < ?")
    .get(new Date().toISOString()) as CountRow

  return {
    open: byStatus.find((r) => r.status === 'open')?.count ?? 0,
    resolved: byStatus.find((r) => r.status === 'resolved')?.count ?? 0,
    urgent: urgent.count,
    overdue: overdue.count,
  }
}
