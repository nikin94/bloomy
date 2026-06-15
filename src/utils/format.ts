// Shared formatters for displaying values in the UI.
// Kept in one place so the table and the detail page use the same
// format (currency, date).

// Amounts are stored as integers in minor units (kopecks). Convert to the
// major unit (rubles) only here, at display time.
export const formatMoney = (minor: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100)

export const formatDate = (ms: number) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short' }).format(new Date(ms))

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
