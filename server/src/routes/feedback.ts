import { Router } from 'express'
import { AuthenticatedRequest, authenticate } from '../auth'
import { asyncHandler } from '../errors'
import { assignmentBody, feedbackListQuery, idParams, noteBody, statusBody } from '../validation'
import {
  addNote,
  assignFeedback,
  getFeedback,
  listFeedback,
  listNotes,
  setFeedbackStatus,
  summarizeFeedback,
} from '../services/feedback'
import type { Summarizer } from '../llm'

export function feedbackRouter(summarizer: Summarizer) {
  const router = Router()

  router.get('/feedback', authenticate, (req, res) => {
    res.json(listFeedback(feedbackListQuery.parse(req.query)))
  })

  router.get('/feedback/:id', authenticate, (req, res) => {
    const { id } = idParams.parse(req.params)
    res.json(getFeedback(id))
  })

  router.post('/feedback/:id/assignment', authenticate, (req, res) => {
    const { id } = idParams.parse(req.params)
    res.json(assignFeedback(id, assignmentBody.parse(req.body)))
  })

  router.post('/feedback/:id/status', authenticate, (req, res) => {
    const { id } = idParams.parse(req.params)
    const { status } = statusBody.parse(req.body)
    res.json(setFeedbackStatus(id, status))
  })

  router.get('/feedback/:id/notes', authenticate, (req, res) => {
    const { id } = idParams.parse(req.params)
    res.json({ notes: listNotes(id) })
  })

  router.post('/feedback/:id/notes', authenticate, (req, res) => {
    const { id } = idParams.parse(req.params)
    const { user } = req as AuthenticatedRequest
    res.status(201).json(addNote(id, user.id, noteBody.parse(req.body)))
  })

  router.post(
    '/feedback/:id/summary',
    authenticate,
    asyncHandler(async (req, res) => {
      const { id } = idParams.parse(req.params)
      res.json({ summary: await summarizeFeedback(summarizer, id) })
    })
  )

  return router
}
