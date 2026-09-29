import { describe, it, expect } from 'vitest'
import { csvCell } from '../../src/services/export'

// Reachable only through a whole CSV round-trip before the service layer existed.
describe('csvCell', () => {
  it('wraps every value in quotes', () => {
    expect(csvCell('hello')).toBe('"hello"')
    expect(csvCell(42)).toBe('"42"')
  })

  it('doubles embedded quotes', () => {
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""')
  })

  it('renders null and undefined as an empty cell', () => {
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
  })

  it.each([
    ['=HYPERLINK("http://evil","click")', '='],
    ['+1-555-0100', '+'],
    ['-2+3', '-'],
    ['@SUM(A1:A9)', '@'],
    ['\tleading tab', '\t'],
    ['\rleading cr', '\r'],
  ])('neutralises a leading %s by prefixing a tab', (input) => {
    const cell = csvCell(input)
    expect(cell.startsWith('"\t')).toBe(true)
    expect(cell).toBe(`"\t${input.replace(/"/g, '""')}"`)
  })

  it('leaves a formula character alone when it is not leading', () => {
    expect(csvCell('total = 5')).toBe('"total = 5"')
  })
})
