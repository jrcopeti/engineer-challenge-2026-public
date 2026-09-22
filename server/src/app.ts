import express, { Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config'
import { errorHandler } from './errors'
import { createSummarizer, type Summarizer } from './llm'
import { authRouter } from './routes/auth'
import { customersRouter } from './routes/customers'
import { exportRouter } from './routes/export'
import { feedbackRouter } from './routes/feedback'
import { metricsRouter } from './routes/metrics'
import { usersRouter } from './routes/users'

export type AppDeps = { summarizer: Summarizer }

/**
 * Build the Express app. Dependencies are injected so tests can swap the summarizer;
 * the exported `app` below is the one the server and the test helpers use.
 */
export function createApp({ summarizer }: AppDeps) {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: config.corsOrigin }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' })
  })

  app.use(authRouter)
  app.use(usersRouter)
  app.use(metricsRouter)
  app.use(exportRouter)
  app.use(customersRouter)
  app.use(feedbackRouter(summarizer))

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' })
  })
  app.use(errorHandler)

  return app
}

export const app = createApp({ summarizer: createSummarizer(config.llm) })
