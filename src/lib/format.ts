// Shared formatters for displaying values in the UI.
// Kept in one place so the table and the detail page use the same
// format (currency, date).

export const formatMoney = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value)

export const formatDate = (ms: number) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short' }).format(new Date(ms))
