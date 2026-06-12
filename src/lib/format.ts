// Общие форматтеры для отображения значений в UI.
// Держим в одном месте, чтобы таблица и детальная страница использовали
// одинаковый формат (валюта, дата).

export const formatMoney = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value)

export const formatDate = (ms: number) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short' }).format(new Date(ms))
