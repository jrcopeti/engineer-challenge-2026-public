import { Router } from 'express'
import { db } from '../db'
import { AuthenticatedRequest, authenticate } from '../auth'
import { HttpError, asyncHandler, notFound } from '../errors'
import { assignmentBody, feedbackListQuery, idParams, noteBody, statusBody } from '../validation'
import { FEEDBACK_SELECT, feedbackFilters, getFeedbackItem } from '../feedback-queries'
import { SummarizerError, type Summarizer } from '../llm'
import type { CountRow, FeedbackItem, FeedbackRow, NoteItem } from '../types'

const PAGE_SIZE = 10

const NOTE_SELECT = `
  SELECT n.*, u.name AS author_name, u.email AS author_email
  FROM feedback_notes n
  LEFT JOIN users u ON u.id = n.author_id`

export function feedbackRouter(summarizer: Summarizer) {
  const router = Router()

  router.get('/feedback', authenticate, (req, res) => {
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

  router.get('/feedback/:id', authenticate, (req, res) => {
    const { id } = idParams.parse(req.params)
    res.json(getFeedbackItem(id))
  })

  router.post('/feedback/:id/assignment', authenticate, (req, res) => {
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

  // Explicit set, not a toggle: two agents clicking at once converge on the same state
  // instead of flipping each other back.
  router.post('/feedback/:id/status', authenticate, (req, res) => {
    const { id } = idParams.parse(req.params)
    const { status } = statusBody.parse(req.body)
    const result = db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id)
    if (result.changes === 0) throw notFound('Feedback not found')
    res.json(getFeedbackItem(id))
  })

  router.get('/feedback/:id/notes', authenticate, (req, res) => {
    const { id } = idParams.parse(req.params)
    const notes = db
      .prepare(`${NOTE_SELECT} WHERE n.feedback_id = ? ORDER BY n.created_at DESC`)
      .all(id) as NoteItem[]
    res.json({ notes })
  })

  router.post('/feedback/:id/notes', authenticate, (req, res) => {
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

  router.post(
    '/feedback/:id/summary',
    authenticate,
    asyncHandler(async (req, res) => {
      const { id } = idParams.parse(req.params)
      const row = db.prepare('SELECT message FROM feedback WHERE id = ?').get(id) as
        Pick<FeedbackRow, 'message'> | undefined
      if (!row) throw notFound('Feedback not found')

      try {
        res.json({ summary: await summarizer.summarize(row.message) })
      } catch (err) {
        if (err instanceof SummarizerError) {
          console.error(
            'summarizer failed:',
            err.cause instanceof Error ? err.cause.constructor.name : err.cause
          )
          throw new HttpError(502, err.message)
        }
        throw err
      }
    })
  )

  return router
}
