// Derived selectors over already-loaded orders — split out of types/order.ts so
// the schema module stays about the STORED shape while the read-side derivations
// (money, plant lists, gift history) live together. Type-only imports from
// ./order, so the re-export there (`export * from './orderSelectors'`) creates
// no runtime cycle. All computed in memory from already-loaded orders, so they
// stay offline-safe and need no extra reads or schema change. Callers pass an
// ALREADY-FILTERED list (e.g. one customer's orders, deleted ones excluded) —
// these helpers don't filter by owner/customer/trash themselves.
import type { Currency, Order, OrderItem } from './order'

// Derived money selectors. All amounts are integers in minor units (kopecks).
// Subtotal = sum of item line totals; total = subtotal + delivery.
export const getSubtotalMinor = (order: Order): number =>
  order.plants.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0)

export const getTotalMinor = (order: Order): number =>
  getSubtotalMinor(order) + order.deliveryPriceMinor

// Plants ordered for display: the most valuable line first (unit price ×
// quantity), descending. Returns a copy, so the stored order array is never
// mutated. Used wherever the plant list is shown (orders table + detail page).
export const plantsByValueDesc = (plants: OrderItem[]): OrderItem[] =>
  [...plants].sort((a, b) => b.unitPriceMinor * b.quantity - a.unitPriceMinor * a.quantity)

// Total PAID revenue grouped by currency (minor units). Orders priced in
// different currencies are never summed together — there is no conversion (see
// the multi-currency model) — so the result is one running total per currency.
// Only `paid` orders count as revenue; pending/refunded and cancelled don't.
export const revenueByCurrencyMinor = (orders: Order[]): Map<Currency, number> => {
  const totals = new Map<Currency, number>()
  for (const order of orders) {
    if (order.paymentStatus !== 'paid') continue
    totals.set(order.currency, (totals.get(order.currency) ?? 0) + getTotalMinor(order))
  }
  return totals
}

// The most-ordered plants across the given orders, by total quantity (summed
// across every order), highest first. Returns at most `limit` { name, quantity }
// entries — used for the customer page's "frequent plants" summary.
export const topPlantsByQuantity = (
  orders: Order[],
  limit: number,
): { name: string; quantity: number }[] => {
  const totals = new Map<string, number>()
  for (const order of orders) {
    for (const plant of order.plants) {
      totals.set(plant.name, (totals.get(plant.name) ?? 0) + plant.quantity)
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, quantity]) => ({ name, quantity }))
}

// Distinct plant names across the given orders, trimmed and sorted (ru locale),
// for the order form's name autocomplete. Deduped case-insensitively, keeping the
// FIRST-seen original casing as the suggestion — so picking one reuses an exact
// existing spelling. That is the whole point: fewer near-duplicate names ("Кактус"
// vs "кактус") means cleaner per-plant stats. Blank names are dropped.
export const collectPlantNames = (orders: Order[]): string[] => {
  const byKey = new Map<string, string>()
  for (const order of orders) {
    for (const plant of order.plants) {
      const name = plant.name.trim()
      if (name === '') continue
      const key = name.toLowerCase()
      if (!byKey.has(key)) byKey.set(key, name)
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'ru'))
}

// Every gift occurrence across the given orders (the caller passes an
// already-filtered list, e.g. one customer's orders), newest first, each
// stamped with the date of the order it was sent with. Deliberately NOT
// deduped: the customer page lists each handed-over gift as its own row — two
// orders gifting the same plant are two separate givings, and the dates are
// what tells them apart. (The order form's "already sent" warning keeps its
// own case-insensitive per-customer set — a repeat only needs flagging once
// there.) Blank names are dropped, mirroring the form's blank-row drop.
export interface GiftOccurrence {
  name: string
  dateCreated: number // the carrying order's creation timestamp (ms)
  orderId: string
}
export const giftsByDateDesc = (orders: Order[]): GiftOccurrence[] => {
  const entries: GiftOccurrence[] = []
  for (const order of orders) {
    for (const gift of order.gifts ?? []) {
      const name = gift.name.trim()
      if (name === '') continue
      entries.push({ name, dateCreated: order.dateCreated, orderId: order.id })
    }
  }
  return entries.sort((a, b) => b.dateCreated - a.dateCreated)
}

// Compact per-line label for the orders-table list: the name, plus the quantity
// as ×N only when it is more than 1 (a quantity of 1 is the common case and just
// adds noise).
export const plantLineLabel = (item: OrderItem): string =>
  item.quantity === 1 ? item.name : `${item.name} ×${item.quantity}`
