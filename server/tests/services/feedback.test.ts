import { describe, it, expect, beforeEach } from 'vitest'
import { db, resetDb } from '../helpers'
import { listFeedback } from '../../src/services/feedback'

const PAGE_SIZE = 10

function idsByCreatedAtDesc(): number[] {
  return (
    db.prepare('SELECT id FROM feedback ORDER BY created_at DESC').all() as Array<{ id: number }>
  ).map((r) => r.id)
}

describe('listFeedback paging', () => {
  beforeEach(() => resetDb())

  // The handed-over code computed the offset so that page 1 skipped the first rows.
  // Asserted here against the service that owns the arithmetic, not through HTTP.
  it('starts page 1 at the newest row', () => {
    const expected = idsByCreatedAtDesc().slice(0, PAGE_SIZE)
    expect(listFeedback({ status: 'all', q: '', page: 1 }).items.map((i) => i.id)).toEqual(expected)
  })

  it('advances by exactly one page and overlaps nothing', () => {
    const all = idsByCreatedAtDesc()
    const page2 = listFeedback({ status: 'all', q: '', page: 2 }).items.map((i) => i.id)
    expect(page2).toEqual(all.slice(PAGE_SIZE, PAGE_SIZE * 2))
    expect(page2).not.toContain(all[0])
  })

  it('reports the total for the filter, not for the page', () => {
    const { items, total } = listFeedback({ status: 'open', q: '', page: 1 })
    const open = db.prepare("SELECT COUNT(*) AS c FROM feedback WHERE status = 'open'").get() as {
      c: number
    }
    expect(total).toBe(open.c)
    expect(items.length).toBeLessThanOrEqual(PAGE_SIZE)
    expect(items.every((i) => i.status === 'open')).toBe(true)
  })

  it('returns an empty page past the end and still echoes the page asked for', () => {
    const result = listFeedback({ status: 'all', q: '', page: 999 })
    expect(result.items).toEqual([])
    expect(result.page).toBe(999)
    expect(result.total).toBeGreaterThan(0)
  })
})
