import { Router } from 'express'
import { authenticate } from '../auth'
import { metricsQuery } from '../validation'
import { getMetrics } from '../services/metrics'

export const metricsRouter = Router()

metricsRouter.get('/metrics', authenticate, (req, res) => {
  res.json(getMetrics(metricsQuery.parse(req.query)))
})
