import { db } from '../db'
import { HttpError, notFound } from '../errors'
import { SummarizerError, type Summarizer } from '../llm'
import { FEEDBACK_SELECT, feedbackFilters, type FeedbackFilter } from './feedback-queries'
import type {
  CountRow,
  FeedbackItem,
  FeedbackPriority,
  FeedbackRow,
  FeedbackStatus,
  NoteItem,
} from '../types'

const PAGE_SIZE = 10

const NOTE_SELECT = `
  SELECT n.*, u.name AS author_name, u.email AS author_email
  FROM feedback_notes n
  LEFT JOIN users u ON u.id = n.author_id`

export type ListFeedbackParams = FeedbackFilter & { page: number }
export type FeedbackPage = { items: FeedbackItem[]; total: number; page: number }

export type AssignmentInput = {
  assignee_id: number | null
  priority: FeedbackPriority
  due_at: string | null
}

export type NoteInput = { body: string; is_private: boolean }

export function listFeedback({ status, q, page }: ListFeedbackParams): FeedbackPage {
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

  return { items, total: total.count, page }
}

export function getFeedback(id: number): FeedbackItem {
  const row = db.prepare(`${FEEDBACK_SELECT} WHERE f.id = ?`).get(id) as FeedbackItem | undefined
  if (!row) throw notFound('Feedback not found')
  return row
}

export function assignFeedback(id: number, input: AssignmentInput): FeedbackItem {
  const { assignee_id, priority, due_at } = input

  if (assignee_id !== null) {
    const assignee = db.prepare('SELECT id FROM users WHERE id = ?').get(assignee_id)
    if (!assignee) throw new HttpError(400, 'Unknown assignee')
  }

  const result = db
    .prepare('UPDATE feedback SET assignee_id = ?, priority = ?, due_at = ? WHERE id = ?')
    .run(assignee_id, priority, due_at, id)
  if (result.changes === 0) throw notFound('Feedback not found')

  return getFeedback(id)
}

// Explicit set, not a toggle: two agents clicking at once converge on the same state
// instead of flipping each other back.
export function setFeedbackStatus(id: number, status: FeedbackStatus): FeedbackItem {
  const result = db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id)
  if (result.changes === 0) throw notFound('Feedback not found')
  return getFeedback(id)
}

export function listNotes(id: number): NoteItem[] {
  return db
    .prepare(`${NOTE_SELECT} WHERE n.feedback_id = ? ORDER BY n.created_at DESC`)
    .all(id) as NoteItem[]
}

export function addNote(id: number, authorId: number, { body, is_private }: NoteInput): NoteItem {
  const exists = db.prepare('SELECT id FROM feedback WHERE id = ?').get(id)
  if (!exists) throw notFound('Feedback not found')

  const result = db
    .prepare(
      'INSERT INTO feedback_notes (feedback_id, author_id, body, is_private, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(id, authorId, body, is_private ? 1 : 0, new Date().toISOString())

  return db.prepare(`${NOTE_SELECT} WHERE n.id = ?`).get(result.lastInsertRowid) as NoteItem
}

export async function summarizeFeedback(summarizer: Summarizer, id: number): Promise<string> {
  const row = db.prepare('SELECT message FROM feedback WHERE id = ?').get(id) as
    | Pick<FeedbackRow, 'message'>
    | undefined
  if (!row) throw notFound('Feedback not found')

  try {
    return await summarizer.summarize(row.message)
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
}
