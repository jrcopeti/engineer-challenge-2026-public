import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what)

/** Express 4 does not forward rejected promises; wrap async handlers. */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next)
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Invalid request',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  // express.json(): malformed body → SyntaxError; over the size limit → type 'entity.too.large'
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON body' })
  }
  if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' })
  }
  console.error(err)
  res.status(500).json({ error: 'Something went wrong' })
}
