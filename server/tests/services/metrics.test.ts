import { describe, it, expect, beforeEach } from 'vitest'
import { db, resetDb } from '../helpers'
import { getMetrics } from '../../src/services/metrics'

describe('getMetrics', () => {
  beforeEach(() => resetDb())

  it('defaults to a window covering every row when none is given', () => {
    const { open, resolved } = getMetrics({})
    const total = db.prepare('SELECT COUNT(*) AS c FROM feedback').get() as { c: number }
    expect(open + resolved).toBe(total.c)
  })

  it('honours a narrow window', () => {
    const empty = getMetrics({
      from: '1990-01-01T00:00:00.000Z',
      to: '1990-01-02T00:00:00.000Z',
    })
    expect(empty.open).toBe(0)
    expect(empty.resolved).toBe(0)
    expect(empty.urgent).toBe(0)
  })

  it('counts overdue against now, ignoring the window', () => {
    db.prepare(
      "INSERT INTO feedback (customer_id, channel, message, status, priority, due_at, created_at) VALUES (1, 'email', 'late', 'open', 'normal', ?, ?)"
    ).run('2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z')

    const windowed = getMetrics({
      from: '2030-01-01T00:00:00.000Z',
      to: '2030-01-02T00:00:00.000Z',
    })
    expect(windowed.open).toBe(0)
    expect(windowed.overdue).toBeGreaterThan(0)
  })
})
