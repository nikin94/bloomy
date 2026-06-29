import { describe, it, expect } from 'vitest'
import {
  formatMoney,
  formatDate,
  formatDateTime,
  parseRublesToMinor,
  formatMinorToInput,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from './format'

describe('sanitizeDecimalInput', () => {
  it('keeps a plain integer amount', () => {
    expect(sanitizeDecimalInput('300')).toBe('300')
  })

  it('keeps a comma separator (ru-RU) and two fractional digits', () => {
    expect(sanitizeDecimalInput('149,90')).toBe('149,90')
  })

  it('caps the fraction at two digits (kopecks)', () => {
    expect(sanitizeDecimalInput('10,999')).toBe('10,99')
  })

  it('drops letters and any other non-numeric characters', () => {
    expect(sanitizeDecimalInput('1a2b3')).toBe('123')
  })

  it('stops at a second separator, keeping only the first decimal group', () => {
    expect(sanitizeDecimalInput('1,2,3')).toBe('1,2')
  })

  it('returns an empty string for input with no digits', () => {
    expect(sanitizeDecimalInput('abc')).toBe('')
  })
})

describe('sanitizeIntegerInput', () => {
  it('keeps a run of digits', () => {
    expect(sanitizeIntegerInput('42')).toBe('42')
  })

  it('strips a decimal separator and everything non-digit', () => {
    expect(sanitizeIntegerInput('1,5')).toBe('15')
    expect(sanitizeIntegerInput('2x')).toBe('2')
  })

  it('returns an empty string when there are no digits', () => {
    expect(sanitizeIntegerInput('')).toBe('')
  })
})

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
    const result = formatMoney(14990, 'RUB')
    // Don't assert exact whitespace (it varies by ICU): the ru-RU locale uses a
    // comma decimal separator and the ₽ symbol.
    expect(result).toContain('149,90')
    expect(result).toContain('₽')
  })

  it('divides by 100 — 100 kopecks is one rouble', () => {
    expect(formatMoney(100, 'RUB')).toContain('1,00')
  })

  it('renders the chosen currency symbol (USD/EUR), same minor-unit model', () => {
    // 50000 minor = 500.00 in any 2-decimal currency.
    expect(formatMoney(50000, 'USD')).toContain('$')
    expect(formatMoney(50000, 'USD')).toContain('500')
    expect(formatMoney(50000, 'EUR')).toContain('€')
  })
})

describe('formatMinorToInput', () => {
  it('renders kopecks as a rouble string with a comma separator', () => {
    expect(formatMinorToInput(14990)).toBe('149,90')
  })

  it('drops the fractional part when the amount is whole roubles', () => {
    expect(formatMinorToInput(30000)).toBe('300')
  })

  it('pads a single-digit kopeck part to two digits', () => {
    expect(formatMinorToInput(14905)).toBe('149,05')
  })

  it('returns an empty string for zero so a blank field round-trips', () => {
    expect(formatMinorToInput(0)).toBe('')
  })

  it('round-trips through parseRublesToMinor', () => {
    expect(parseRublesToMinor(formatMinorToInput(14990))).toBe(14990)
    expect(parseRublesToMinor(formatMinorToInput(30000))).toBe(30000)
  })
})

describe('formatDate', () => {
  it('formats a timestamp as a short ru-RU date (dd.mm.yy…)', () => {
    expect(formatDate(0)).toMatch(/^\d{1,2}\.\d{1,2}\.\d{2,4}$/)
  })
})

describe('formatDateTime', () => {
  it('formats a timestamp as a short ru-RU date AND time', () => {
    // Date part then a HH:MM time part, separated by a comma.
    expect(formatDateTime(0)).toMatch(/^\d{1,2}\.\d{1,2}\.\d{2,4},\s\d{1,2}:\d{2}$/)
  })
})
