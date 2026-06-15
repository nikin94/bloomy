import { describe, it, expect } from 'vitest'
import { formatMoney, formatDate, parseRublesToMinor } from './format'

describe('parseRublesToMinor', () => {
  it('parses an integer rouble amount into kopecks', () => {
    expect(parseRublesToMinor('100')).toBe(10000)
  })

  it('accepts a comma as the decimal separator', () => {
    expect(parseRublesToMinor('149,90')).toBe(14990)
  })

  it('accepts a dot as the decimal separator', () => {
    expect(parseRublesToMinor('149.90')).toBe(14990)
  })

  it('trims surrounding whitespace', () => {
    expect(parseRublesToMinor('  50  ')).toBe(5000)
  })

  it('rounds to the nearest kopeck', () => {
    expect(parseRublesToMinor('10,999')).toBe(1100)
  })

  it('returns 0 for an empty string', () => {
    expect(parseRublesToMinor('')).toBe(0)
  })

  it('returns 0 for non-numeric input', () => {
    expect(parseRublesToMinor('abc')).toBe(0)
  })
})

describe('formatMoney', () => {
  it('renders kopecks as roubles with the currency symbol', () => {
    const result = formatMoney(14990)
    // Don't assert exact whitespace (it varies by ICU): the ru-RU locale uses a
    // comma decimal separator and the ₽ symbol.
    expect(result).toContain('149,90')
    expect(result).toContain('₽')
  })

  it('divides by 100 — 100 kopecks is one rouble', () => {
    expect(formatMoney(100)).toContain('1,00')
  })
})

describe('formatDate', () => {
  it('formats a timestamp as a short ru-RU date (dd.mm.yy…)', () => {
    expect(formatDate(0)).toMatch(/^\d{1,2}\.\d{1,2}\.\d{2,4}$/)
  })
})
