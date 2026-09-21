import express, { Request, Response } from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { AuthenticatedRequest, authenticate, signToken } from './auth'
import { summarizeText } from './llm'
import { HttpError, asyncHandler, errorHandler, notFound } from './errors'
import {
  assignmentBody,
  exportQuery,
  feedbackListQuery,
  idParams,
  likePattern,
  loginBody,
  metricsQuery,
  noteBody,
  statusBody,
} from './validation'
import type {
  CountRow,
  CustomerRow,
  FeedbackItem,
  FeedbackRow,
  NoteItem,
  PublicUser,
  UserRow,
} from './types'

export const app = express()
app.use(cors())
app.use(express.json({ limit: '100kb' }))

const PAGE_SIZE = 10
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

// One JOIN instead of two extra queries per row.
const FEEDBACK_SELECT = `
  SELECT f.id, f.customer_id, c.name AS customer_name, c.email AS customer_email,
         f.channel, f.message, f.status, f.priority, f.assignee_id,
         u.name AS assignee_name, f.due_at, f.created_at
  FROM feedback f
  JOIN customers c ON c.id = f.customer_id
  LEFT JOIN users u ON u.id = f.assignee_id`

const NOTE_SELECT = `
  SELECT n.*, u.name AS author_name, u.email AS author_email
  FROM feedback_notes n
  LEFT JOIN users u ON u.id = n.author_id`

/** Shared WHERE builder for list + export. Returns SQL fragment and bound params. */
function feedbackFilters(status: string, search: string) {
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

function getFeedbackItem(id: number): FeedbackItem {
  const row = db.prepare(`${FEEDBACK_SELECT} WHERE f.id = ?`).get(id) as FeedbackItem | undefined
  if (!row) throw notFound('Feedback not found')
  return row
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

app.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginBody.parse(req.body)

    const user = db
      .prepare('SELECT id, email, password_hash, name, role FROM users WHERE email = ?')
      .get(email) as UserRow | undefined

    // Compare against a dummy hash when the user is unknown so response time
    // does not reveal whether the email exists.
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
    if (!user || !ok) {
      throw new HttpError(401, 'Invalid email or password')
    }

    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }
    res.json({ token: signToken(publicUser), user: publicUser })
  })
)

app.get('/feedback', authenticate, (req: Request, res: Response) => {
  const { status, q, page } = feedbackListQuery.parse(req.query)
  const { where, params } = feedbackFilters(status, q)
  const offset = (page - 1) * PAGE_SIZE

  const items = db
    .prepare(`${FEEDBACK_SELECT} ${where} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, PAGE_SIZE, offset) as FeedbackItem[]

  const total = db
    .prepare(
      `SELECT COUNT(*) AS count FROM feedback f JOIN customers c ON c.id = f.customer_id ${where}`
    )
    .get(...params) as CountRow

  res.json({ items, total: total.count, page })
})

app.get('/users', authenticate, (_req: Request, res: Response) => {
  const users = db
    .prepare('SELECT id, email, name, role FROM users ORDER BY name')
    .all() as PublicUser[]
  res.json({ users })
})

app.get('/metrics', authenticate, (req: Request, res: Response) => {
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

app.get('/export.csv', authenticate, (req: Request, res: Response) => {
  const { status, q } = exportQuery.parse(req.query)
  const { where, params } = feedbackFilters(status, q)

  type ExportRow = FeedbackItem & { plan: string; internal_notes: string | null }
  const rows = db
    .prepare(
      `SELECT f.*, c.name AS customer_name, c.email AS customer_email, c.plan, u.name AS assignee_name,
        (SELECT GROUP_CONCAT(body, ' | ') FROM feedback_notes WHERE feedback_id = f.id) AS internal_notes
       FROM feedback f
       JOIN customers c ON c.id = f.customer_id
       LEFT JOIN users u ON u.id = f.assignee_id
       ${where}
       ORDER BY f.created_at DESC`
    )
    .all(...params) as ExportRow[]

  const header = [
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
    'internal_notes',
  ]
  const lines = [
    header.join(','),
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
        row.internal_notes,
      ]
        .map(csvCell)
        .join(',')
    ),
  ]

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="pulse-feedback-export.csv"')
  res.send(lines.join('\n'))
})

app.get('/customers/:id', authenticate, (req: Request, res: Response) => {
  const { id } = idParams.parse(req.params)
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as
    CustomerRow | undefined
  if (!customer) throw notFound('Customer not found')

  const history = db
    .prepare(`${FEEDBACK_SELECT} WHERE f.customer_id = ? ORDER BY f.created_at DESC LIMIT 8`)
    .all(id) as FeedbackItem[]

  res.json({ ...customer, history })
})

app.get('/feedback/:id', authenticate, (req: Request, res: Response) => {
  const { id } = idParams.parse(req.params)
  res.json(getFeedbackItem(id))
})

app.post('/feedback/:id/assignment', authenticate, (req: Request, res: Response) => {
  const { id } = idParams.parse(req.params)
  const { assignee_id, priority, due_at } = assignmentBody.parse(req.body)

  if (assignee_id !== null) {
    const assignee = db.prepare('SELECT id FROM users WHERE id = ?').get(assignee_id)
    if (!assignee) throw new HttpError(400, 'Unknown assignee')
  }

  const result = db
    .prepare('UPDATE feedback SET assignee_id = ?, priority = ?, due_at = ? WHERE id = ?')
    .run(assignee_id, priority, due_at, id)
  if (result.changes === 0) throw notFound('Feedback not found')

  res.json(getFeedbackItem(id))
})

app.get('/feedback/:id/notes', authenticate, (req: Request, res: Response) => {
  const { id } = idParams.parse(req.params)
  const notes = db
    .prepare(`${NOTE_SELECT} WHERE n.feedback_id = ? ORDER BY n.created_at DESC`)
    .all(id) as NoteItem[]
  res.json({ notes })
})

app.post('/feedback/:id/notes', authenticate, (req: Request, res: Response) => {
  const { id } = idParams.parse(req.params)
  const { body, is_private } = noteBody.parse(req.body)
  const user = (req as AuthenticatedRequest).user

  const exists = db.prepare('SELECT id FROM feedback WHERE id = ?').get(id)
  if (!exists) throw notFound('Feedback not found')

  const result = db
    .prepare(
      'INSERT INTO feedback_notes (feedback_id, author_id, body, is_private, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(id, user.id, body, is_private ? 1 : 0, new Date().toISOString())

  const note = db.prepare(`${NOTE_SELECT} WHERE n.id = ?`).get(result.lastInsertRowid) as NoteItem
  res.status(201).json(note)
})

// Explicit set, not a toggle: two agents clicking at once converge on the same state
// instead of flipping each other back.
app.post('/feedback/:id/status', authenticate, (req: Request, res: Response) => {
  const { id } = idParams.parse(req.params)
  const { status } = statusBody.parse(req.body)
  const result = db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id)
  if (result.changes === 0) throw notFound('Feedback not found')
  res.json(getFeedbackItem(id))
})

app.post(
  '/feedback/:id/summary',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParams.parse(req.params)
    const row = db.prepare('SELECT message FROM feedback WHERE id = ?').get(id) as
      Pick<FeedbackRow, 'message'> | undefined
    if (!row) throw notFound('Feedback not found')

    const prompt = `Summarize the following customer feedback in one or two short sentences for a support agent.\n\n${row.message}`
    const summary = await summarizeText(prompt)
    res.json({ summary })
  })
)

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})
app.use(errorHandler)
