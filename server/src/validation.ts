import { z } from 'zod'
import { FEEDBACK_PRIORITIES, FEEDBACK_STATUSES } from './types'

const positiveInt = z.coerce.number().int().positive()

const isoDate = z.iso.date() // YYYY-MM-DD
const isoDateTime = z.iso.datetime() // 2026-09-21T10:00:00.000Z

export const idParams = z.object({ id: positiveInt })

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(1024),
})

export const feedbackListQuery = z.object({
  status: z.enum(['all', ...FEEDBACK_STATUSES]).default('all'),
  q: z.string().trim().max(200).default(''),
  page: positiveInt.default(1),
})

export const exportQuery = feedbackListQuery.omit({ page: true })

export const metricsQuery = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
})

export const assignmentBody = z.object({
  assignee_id: positiveInt.nullable().default(null),
  priority: z.enum(FEEDBACK_PRIORITIES),
  // The date input sends YYYY-MM-DD; the seed stores full ISO. Both accepted, '' → null.
  due_at: z
    .union([isoDate, isoDateTime, z.literal('')])
    .nullable()
    .default(null)
    .transform((v) => (v === '' ? null : v)),
})

export const noteBody = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(5000),
  is_private: z.boolean().default(false),
})

export const summarizeBody = z.object({ id: positiveInt })

/**
 * Escape a user string for use inside a LIKE pattern. Callers must add
 * `ESCAPE '\'` to the SQL. Without this, `%` and `_` in a search act as wildcards.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}
