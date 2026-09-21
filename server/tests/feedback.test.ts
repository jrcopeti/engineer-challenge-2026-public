import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app, db, resetDb, bearer } from './helpers'

beforeEach(() => resetDb())

const SQLI_PAYLOADS = [
  `' OR 1=1 --`,
  `'; DROP TABLE feedback; --`,
  `x' UNION SELECT id, email, password_hash, name, role, 1, 2, 3, 4, 5, 6, 7 FROM users --`,
]

function countFeedback(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM feedback').get() as { count: number }).count
}

describe('GET /feedback', () => {
  it('validates the status filter instead of interpolating it', async () => {
    for (const payload of SQLI_PAYLOADS) {
      const res = await request(app).get('/feedback').query({ status: payload }).set(bearer())
      expect(res.status).toBe(400)
    }
    expect(countFeedback()).toBe(80)
  })

  it('treats search input as data, not SQL', async () => {
    for (const payload of SQLI_PAYLOADS) {
      const res = await request(app).get('/feedback').query({ q: payload }).set(bearer())
      expect(res.status).toBe(200)
      expect(res.body.items).toEqual([])
    }
    expect(countFeedback()).toBe(80)
  })

  it('does not treat % and _ in the search as wildcards', async () => {
    const res = await request(app).get('/feedback').query({ q: '%' }).set(bearer())
    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([])
  })

  it('searches message, customer name and email', async () => {
    const byMessage = await request(app)
      .get('/feedback')
      .query({ q: 'charged twice' })
      .set(bearer())
    expect(byMessage.body.items.length).toBeGreaterThan(0)
    const byName = await request(app).get('/feedback').query({ q: 'Olivia' }).set(bearer())
    expect(
      byName.body.items.every(
        (i: { customer_name: string }) => i.customer_name === 'Olivia Bennett'
      )
    ).toBe(true)
  })

  it('returns the newest 10 items on page 1 and counts only the filtered rows', async () => {
    const all = await request(app).get('/feedback').set(bearer())
    expect(all.status).toBe(200)
    expect(all.body.items).toHaveLength(10)
    expect(all.body.total).toBe(80)
    const newest = db.prepare('SELECT id FROM feedback ORDER BY created_at DESC LIMIT 1').get() as {
      id: number
    }
    expect(all.body.items[0].id).toBe(newest.id)

    const resolved = await request(app).get('/feedback').query({ status: 'resolved' }).set(bearer())
    expect(resolved.body.total).toBe(24)
    expect(resolved.body.items.every((i: { status: string }) => i.status === 'resolved')).toBe(true)
  })

  it('rejects page=0 and non-numeric pages', async () => {
    expect((await request(app).get('/feedback').query({ page: 0 }).set(bearer())).status).toBe(400)
    expect((await request(app).get('/feedback').query({ page: 'abc' }).set(bearer())).status).toBe(
      400
    )
  })

  it('joins customer and assignee into each item', async () => {
    const res = await request(app).get('/feedback').set(bearer())
    const item = res.body.items[0]
    expect(item).toMatchObject({
      customer_name: expect.any(String),
      customer_email: expect.stringContaining('@'),
      assignee_name: expect.any(String),
    })
  })
})

describe('GET /feedback/:id', () => {
  it('returns 404 for an unknown id and 400 for a non-numeric one', async () => {
    expect((await request(app).get('/feedback/9999').set(bearer())).status).toBe(404)
    expect((await request(app).get('/feedback/1%20OR%201=1').set(bearer())).status).toBe(400)
  })
})

describe('POST /feedback/:id/assignment', () => {
  it('rejects SQL in any field and leaves other rows untouched', async () => {
    const before = db.prepare('SELECT id, priority FROM feedback ORDER BY id').all()
    const res = await request(app)
      .post('/feedback/1/assignment')
      .set(bearer())
      .send({ assignee_id: 1, priority: `x' WHERE 1=1 --`, due_at: '2026-01-01' })
    expect(res.status).toBe(400)
    expect(db.prepare('SELECT id, priority FROM feedback ORDER BY id').all()).toEqual(before)
  })

  it('updates only the targeted row with valid input', async () => {
    const res = await request(app)
      .post('/feedback/1/assignment')
      .set(bearer())
      .send({ assignee_id: 2, priority: 'urgent', due_at: '2026-12-31' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: 1,
      assignee_id: 2,
      assignee_name: 'Ben Carter',
      priority: 'urgent',
      due_at: '2026-12-31',
    })
    const other = db.prepare('SELECT priority FROM feedback WHERE id = 2').get() as {
      priority: string
    }
    expect(other.priority).not.toBe('urgent')
  })

  it('stores an empty due date as NULL and allows unassigning', async () => {
    const res = await request(app)
      .post('/feedback/1/assignment')
      .set(bearer())
      .send({ assignee_id: null, priority: 'low', due_at: '' })
    expect(res.status).toBe(200)
    expect(res.body.assignee_id).toBeNull()
    expect(res.body.due_at).toBeNull()
  })

  it('rejects an unknown assignee', async () => {
    const res = await request(app)
      .post('/feedback/1/assignment')
      .set(bearer())
      .send({ assignee_id: 999, priority: 'low', due_at: null })
    expect(res.status).toBe(400)
  })

  it('returns 404 for an unknown feedback id', async () => {
    const res = await request(app)
      .post('/feedback/9999/assignment')
      .set(bearer())
      .send({ assignee_id: null, priority: 'low', due_at: null })
    expect(res.status).toBe(404)
  })
})

describe('notes', () => {
  it('rejects SQL in the id and empty bodies', async () => {
    expect((await request(app).get('/feedback/1%20OR%201=1/notes').set(bearer())).status).toBe(400)
    const empty = await request(app).post('/feedback/1/notes').set(bearer()).send({ body: '   ' })
    expect(empty.status).toBe(400)
  })

  it('creates a note attributed to the caller and lists it', async () => {
    const created = await request(app)
      .post('/feedback/3/notes')
      .set(bearer())
      .send({ body: 'Called the customer', is_private: true })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      feedback_id: 3,
      author_name: 'Alice Martin',
      is_private: 1,
    })

    const list = await request(app).get('/feedback/3/notes').set(bearer())
    expect(list.body.notes[0].id).toBe(created.body.id)
  })

  it('refuses a note on a feedback item that does not exist', async () => {
    const res = await request(app).post('/feedback/9999/notes').set(bearer()).send({ body: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('GET /metrics', () => {
  it('rejects a non-ISO date range instead of interpolating it', async () => {
    const res = await request(app).get('/metrics').query({ from: `' OR 1=1 --` }).set(bearer())
    expect(res.status).toBe(400)
  })

  it('returns counts', async () => {
    const res = await request(app).get('/metrics').set(bearer())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      open: 56,
      resolved: 24,
      urgent: expect.any(Number),
      overdue: expect.any(Number),
    })
  })
})

describe('GET /export.csv', () => {
  it('validates the status filter', async () => {
    const res = await request(app).get('/export.csv').query({ status: `' OR 1=1 --` }).set(bearer())
    expect(res.status).toBe(400)
  })

  it('applies the same search as the inbox', async () => {
    const res = await request(app).get('/export.csv').query({ q: 'Olivia' }).set(bearer())
    expect(res.status).toBe(200)
    const lines = res.text.split('\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.slice(1).every((l) => l.includes('Olivia Bennett'))).toBe(true)
  })
})

describe('POST /summarize', () => {
  it('returns 404 for an unknown id instead of crashing', async () => {
    const res = await request(app).post('/summarize').set(bearer()).send({ id: 9999 })
    expect(res.status).toBe(404)
  })

  it('summarizes with the fake provider', async () => {
    const res = await request(app).post('/summarize').set(bearer()).send({ id: 1 })
    expect(res.status).toBe(200)
    expect(typeof res.body.summary).toBe('string')
  })
})

describe('error handling', () => {
  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/nope').set(bearer())
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/feedback/1/notes')
      .set(bearer())
      .set('Content-Type', 'application/json')
      .send('{not json')
    expect(res.status).toBe(400)
  })
})
