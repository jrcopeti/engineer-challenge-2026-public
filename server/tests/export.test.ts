import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app, db, resetDb, bearer } from './helpers'

beforeEach(() => resetDb())

function exportRows() {
  return request(app)
    .get('/export.csv')
    .set(bearer())
    .then((res) => {
      expect(res.status).toBe(200)
      return res.text.split('\n')
    })
}

describe('GET /export.csv', () => {
  it('neutralises formula prefixes so spreadsheets open them as text', async () => {
    // The seed plants a message starting with =HYPERLINK(...).
    const rows = await exportRows()
    const formulaRows = rows.filter((r) => r.includes('HYPERLINK'))
    expect(formulaRows.length).toBeGreaterThan(0)
    for (const row of formulaRows) {
      expect(row).toContain('"\t=HYPERLINK(')
      expect(row).not.toContain('"=HYPERLINK(')
    }
  })

  it('neutralises every formula-leading character, not just =', async () => {
    for (const lead of ['+', '-', '@', '\t', '\r']) {
      db.prepare('UPDATE feedback SET message = ? WHERE id = 1').run(`${lead}1+1`)
      const rows = await exportRows()
      const row = rows.find((r) => r.startsWith('"1",'))
      expect(row).toContain(`"\t${lead}1+1"`)
    }
  })

  it('still doubles quotes', async () => {
    db.prepare('UPDATE feedback SET message = ? WHERE id = 1').run('He said "hi"')
    const rows = await exportRows()
    expect(rows.find((r) => r.startsWith('"1",'))).toContain('"He said ""hi"""')
  })

  it('excludes private notes and includes shared ones', async () => {
    // Seed: feedback 1 has a private note ("VIP account..."), feedback 2 a shared one.
    const rows = await exportRows()
    expect(rows[0]).toContain('shared_notes')
    expect(rows[0]).not.toContain('internal_notes')
    const joined = rows.join('\n')
    expect(joined).not.toContain('VIP account')
    expect(joined).toContain('Reproduced in Chrome')
  })
})
