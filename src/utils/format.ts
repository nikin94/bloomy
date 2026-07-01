// Shared formatters for displaying values in the UI.
// Kept in one place so the table and the detail page use the same
// format (currency, date).
import i18next from 'i18next'
import type { Currency } from '../types/order'

// BCP-47 locale for Intl number/currency formatting, derived from the active UI
// language so the grouping and decimal separators follow the chosen language
// (e.g. "1 500,00" in ru, "1,500.00" in en). i18next is the same singleton the
// app inits; a type-only Currency import keeps this free of a runtime cycle.
const intlLocale = (): string => (i18next.language === 'en' ? 'en-US' : 'ru-RU')

// Currency-formatter options shared by formatMoney and currencySymbol so they
// stay a single source of truth. `narrowSymbol` forces the glyph (₽/$/€) even in
// locales whose default `symbol` is the ISO code — e.g. en-US renders RUB as the
// literal "RUB" by default, but as "₽" with narrowSymbol.
const currencyFormatOptions = (currency: Currency): Intl.NumberFormatOptions => ({
  style: 'currency',
  currency,
  currencyDisplay: 'narrowSymbol',
})

// Amounts are stored as integers in minor units (kopecks/cents). Render in the
// order's own currency — there is no conversion, the symbol just labels the
// amount the operator entered. RUB/USD/EUR are all 2-decimal, so `/100` holds
// for every supported currency. `currency` is required: a "currency-less"
// context (the price-filter range) must still pick a symbol explicitly (the
// filtered currency, falling back to the settings default) rather than letting
// a silent RUB default slip past the type checker at a future call site.
export const formatMoney = (minor: number, currency: Currency) =>
  new Intl.NumberFormat(intlLocale(), currencyFormatOptions(currency)).format(minor / 100)

// The currency's symbol glyph for the active locale (e.g. "₽", "$", "€"), pulled
// from the SAME Intl formatter as formatMoney so it's a single source of truth —
// the option label "Рубли (₽)" and a formatted amount can never disagree on the
// symbol. Falls back to the code if a locale exposes no distinct symbol part.
export const currencySymbol = (currency: Currency): string =>
  new Intl.NumberFormat(intlLocale(), currencyFormatOptions(currency))
    .formatToParts(0)
    .find((part) => part.type === 'currency')?.value ?? currency

export const formatDate = (ms: number) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short' }).format(new Date(ms))

// Local `yyyy-mm-dd` string for an `<input type="date">` value from a ms
// timestamp. Uses local calendar parts (not toISOString, which is UTC and would
// shift the day across the timezone boundary), so the field shows the day the
// operator actually sees.
export const toDateInputValue = (ms: number): string => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Parse a `yyyy-mm-dd` `<input type="date">` value into a local ms timestamp at
// the START (00:00:00.000) or END (23:59:59.999) of that day. `edge: 'end'` makes
// a range's upper bound INCLUSIVE of the whole day the user picked. An empty or
// malformed value returns null, so that side of a range stays open. Shared by the
// stats custom period and the orders-list date filter.
export const parseDateInput = (value: string, edge: 'start' | 'end'): number | null => {
  const parts = value.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null
  const [y, m, day] = parts
  return edge === 'start'
    ? new Date(y, m - 1, day, 0, 0, 0, 0).getTime()
    : new Date(y, m - 1, day, 23, 59, 59, 999).getTime()
}

// Time of day only, e.g. "14:32". Pairs with formatDate to show a creation
// moment over two lines (date above, time below) in the orders table.
export const formatTime = (ms: number) =>
  new Intl.DateTimeFormat('ru-RU', { timeStyle: 'short' }).format(new Date(ms))

// Short date AND time, e.g. "22.06.2026, 14:32". Used by the sync indicator to
// show when the local data last reached the server (date matters when offline
// for days; time matters within a day).
export const formatDateTime = (ms: number) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms))

// Filter raw keystrokes into a decimal money string as the user types: digits
// with at most one separator (comma or dot, ru-RU uses a comma) and at most two
// fractional digits (kopecks). Drives the Input `numeric="decimal"` flag, so a
// money field rejects letters/extra separators live instead of validating later.
export const sanitizeDecimalInput = (value: string): string => {
  const [intPart = '', sep = '', fracPart = ''] =
    value.replace(/[^\d.,]/g, '').match(/^(\d*)([.,]?)(\d*)/)?.slice(1) ?? []
  return sep ? `${intPart}${sep}${fracPart.slice(0, 2)}` : intPart
}

// Filter raw keystrokes into a non-negative integer string (digits only). Drives
// the Input `numeric="integer"` flag (e.g. the plant quantity).
export const sanitizeIntegerInput = (value: string): string => value.replace(/\D/g, '')

// Parse a user-entered amount in the major unit (rubles, e.g. "149,90") into
// integer minor units (kopecks). Accepts a comma or a dot as the decimal
// separator. Returns 0 for empty or non-numeric input.
export const parseRublesToMinor = (value: string): number => {
  const rubles = Number(value.replace(',', '.').trim())
  return Number.isFinite(rubles) ? Math.round(rubles * 100) : 0
}

// Inverse of parseRublesToMinor: turn stored minor units (kopecks) back into the
// plain string a form input expects (comma decimal separator, no currency
// symbol), e.g. 14990 -> "149,90", 30000 -> "300". Zero becomes "" so a blank
// field round-trips (the form treats an empty amount as 0). Used to prefill the
// edit form from an existing order.
export const formatMinorToInput = (minor: number): string => {
  if (minor === 0) return ''
  const rubles = Math.trunc(minor / 100)
  const kopecks = Math.abs(minor % 100)
  return kopecks === 0 ? String(rubles) : `${rubles},${String(kopecks).padStart(2, '0')}`
}
