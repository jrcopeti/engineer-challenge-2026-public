export const FEEDBACK_STATUSES = ['open', 'resolved'] as const
export const FEEDBACK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number]

/** Raw rows as stored in SQLite. */
export type UserRow = {
  id: number
  email: string
  password_hash: string
  name: string
  role: string
}

export type PublicUser = Omit<UserRow, 'password_hash'>

export type CustomerRow = {
  id: number
  name: string
  email: string
  plan: string
  health_score: number
}

export type FeedbackRow = {
  id: number
  customer_id: number
  channel: string
  message: string
  status: FeedbackStatus
  priority: FeedbackPriority
  assignee_id: number | null
  due_at: string | null
  created_at: string
}

export type NoteRow = {
  id: number
  feedback_id: number
  author_id: number
  body: string
  is_private: 0 | 1
  created_at: string
}

/** Feedback joined with customer and assignee, as returned by the API. */
export type FeedbackItem = FeedbackRow & {
  customer_name: string
  customer_email: string
  assignee_name: string | null
}

export type NoteItem = NoteRow & {
  author_name: string | null
  author_email: string | null
}

export type CountRow = { count: number }
