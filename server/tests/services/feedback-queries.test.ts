import { describe, it, expect } from 'vitest'
import { feedbackFilters } from '../../src/services/feedback-queries'

// The LIKE escaping is only inferable from row counts through the API.
describe('feedbackFilters', () => {
  it('builds no WHERE clause for the unfiltered inbox', () => {
    expect(feedbackFilters('all', '')).toEqual({ where: '', params: [] })
  })

  it('filters on status alone', () => {
    const { where, params } = feedbackFilters('open', '')
    expect(where).toBe('WHERE f.status = ?')
    expect(params).toEqual(['open'])
  })

  it('searches message, customer name and email with one pattern each', () => {
    const { where, params } = feedbackFilters('all', 'refund')
    expect(where).toContain('f.message LIKE ?')
    expect(where).toContain('c.name LIKE ?')
    expect(where).toContain('c.email LIKE ?')
    expect(params).toEqual(['%refund%', '%refund%', '%refund%'])
  })

  it("escapes LIKE wildcards so % and _ match literally", () => {
    expect(feedbackFilters('all', '100%').params[0]).toBe('%100\\%%')
    expect(feedbackFilters('all', 'a_b').params[0]).toBe('%a\\_b%')
    expect(feedbackFilters('all', 'back\\slash').params[0]).toBe('%back\\\\slash%')
    expect(feedbackFilters('all', '%').where).toContain("ESCAPE '\\'")
  })

  it('orders params status-first so they bind in clause order', () => {
    const { where, params } = feedbackFilters('resolved', 'x')
    expect(where.indexOf('f.status')).toBeLessThan(where.indexOf('f.message'))
    expect(params).toEqual(['resolved', '%x%', '%x%', '%x%'])
  })
})
