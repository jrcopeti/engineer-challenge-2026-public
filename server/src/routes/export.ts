import { Router } from 'express'
import { authenticate } from '../auth'
import { exportQuery } from '../validation'
import { buildFeedbackCsv } from '../services/export'

export const exportRouter = Router()

exportRouter.get('/export.csv', authenticate, (req, res) => {
  const csv = buildFeedbackCsv(exportQuery.parse(req.query))

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="pulse-feedback-export.csv"')
  res.send(csv)
})
