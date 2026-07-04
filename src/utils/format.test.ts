import { describe, it, expect } from 'vitest'
import i18n from '@/i18n/config'
import {
  formatMoney,
  currencySymbol,
  formatDate,
  formatTime,
  formatDateTime,
  parseRublesToMinor,
  formatMinorToInput,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  toDateInputValue,
  parseDateInput,
} from './format'

describe('toDateInputValue', () => {
  it('formats a timestamp as local yyyy-mm-dd, zero-padded', () => {
    expect(toDateInputValue(new Date(2026, 2, 5, 14, 30).getTime())).toBe('2026-03-05')
    expect(toDateInputValue(new Date(2026, 11, 31, 0, 0).getTime())).toBe('2026-12-31')
  })
})

describe('parseDateInput', () => {
  it("returns local start-of-day for edge 'start'", () => {
    expect(parseDateInput('2026-03-05', 'start')).toBe(new Date(2026, 2, 5, 0, 0, 0, 0).getTime())
  })
  it("returns the last ms of the day for edge 'end' (inclusive upper bound)", () => {
    expect(parseDateInput('2026-03-05', 'end')).toBe(new Date(2026, 2, 5, 23, 59, 59, 999).getTime())
  })
  it('round-trips with toDateInputValue', () => {
    const start = parseDateInput('2026-07-15', 'start')!
    expect(toDateInputValue(start)).toBe('2026-07-15')
  })
  it('returns null for an empty or malformed value (open bound)', () => {
    expect(parseDateInput('', 'start')).toBeNull()
    expect(parseDateInput('2026-07', 'end')).toBeNull()
    expect(parseDateInput('not-a-date', 'start')).toBeNull()
  })
})

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

describe('currencySymbol', () => {
  it('returns the symbol glyph for each supported currency', () => {
    expect(currencySymbol('RUB')).toBe('₽')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('EUR')).toBe('€')
  })

  it('keeps the ₽ glyph under en (narrowSymbol, not the "RUB" ISO code)', async () => {
    // en-US's default currency symbol for RUB is the literal "RUB"; narrowSymbol
    // forces the glyph so the English dropdown reads "Rubles (₽)", not "(RUB)".
    await i18n.changeLanguage('en')
    try {
      expect(currencySymbol('RUB')).toBe('₽')
      expect(formatMoney(50000, 'RUB')).toContain('₽')
    } finally {
      await i18n.changeLanguage('ru')
    }
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

describe('date formatters follow the active UI language', () => {
  // Under ru the date is dot-separated (dd.mm.yyyy); under en it must switch to
  // the en-US slash order (m/d/yyyy), same as formatMoney follows the locale —
  // so an English user never sees a ru-formatted date beside en-formatted money.
  it('renders en-US formats after switching the language, ru after switching back', async () => {
    await i18n.changeLanguage('en')
    try {
      // en-US short date uses slashes, not dots.
      expect(formatDate(0)).toContain('/')
      expect(formatDate(0)).not.toContain('.')
      // 12-hour clock brings an AM/PM marker the ru 24-hour format never has.
      expect(formatTime(0)).toMatch(/AM|PM/)
      expect(formatDateTime(0)).toContain('/')
    } finally {
      await i18n.changeLanguage('ru')
    }
    // Back on ru: dot-separated date, 24-hour time (no AM/PM).
    expect(formatDate(0)).toContain('.')
    expect(formatTime(0)).not.toMatch(/AM|PM/)
  })
})
