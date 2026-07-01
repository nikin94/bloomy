// Statistics helpers for the Statistics tab. Everything here is a PURE function
// over an already-loaded, already-owner-scoped order list (fetchOrders drops
// deleted ones) — so the whole tab computes in memory, stays offline-safe, and
// needs no schema change or extra reads. `now` is passed in (never read from the
// clock here) so the helpers are deterministic and unit-testable, and so the page
// can capture a single mount-time timestamp (a render-time Date.now() isn't pure).
import type { Currency, Order } from './order'

// The period the tab is scoped to. 'month'/'year' are the current calendar
// month/year (local time); 'all' has no lower bound. The KPI cards + status
// breakdown follow this; the monthly chart deliberately does not (see below).
export const STATS_PERIODS = ['month', 'year', 'all'] as const
export type StatsPeriod = (typeof STATS_PERIODS)[number]

// Inclusive lower bound (ms) for a period given the current time, or null for
// 'all' (no bound). Uses local calendar boundaries so "this month"/"this year"
// match what the operator sees on a calendar, not UTC.
export const periodStart = (period: StatsPeriod, now: number): number | null => {
  const d = new Date(now)
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  if (period === 'year') return new Date(d.getFullYear(), 0, 1).getTime()
  return null // 'all'
}

// Orders created within the selected period (by dateCreated). 'all' returns the
// list unchanged.
export const filterOrdersByPeriod = (
  orders: Order[],
  period: StatsPeriod,
  now: number,
): Order[] => {
  const start = periodStart(period, now)
  return start === null ? orders : orders.filter((o) => o.dateCreated >= start)
}

// Total PAID delivery charge grouped by currency (minor units). Mirrors
// revenueByCurrencyMinor: only `paid` orders count (a realized amount), and
// currencies are never summed across each other (no conversion). Delivery is a
// component of the order total, so keeping it paid-only makes it directly
// comparable to the revenue figure shown beside it.
export const deliveryByCurrencyMinor = (orders: Order[]): Map<Currency, number> => {
  const totals = new Map<Currency, number>()
  for (const order of orders) {
    if (order.paymentStatus !== 'paid') continue
    totals.set(order.currency, (totals.get(order.currency) ?? 0) + order.deliveryPriceMinor)
  }
  return totals
}

// How the period's orders split by outcome: delivered, cancelled, or still in
// progress (any non-terminal shipment status — new/packing/shipped). This is the
// "share completed vs cancelled" view — the cancel rate is a number that appears
// nowhere else (the active list only shows the current backlog).
export interface StatusBreakdown {
  delivered: number
  cancelled: number
  inProgress: number
  total: number
}

export const statusBreakdown = (orders: Order[]): StatusBreakdown => {
  let delivered = 0
  let cancelled = 0
  for (const order of orders) {
    if (order.shipmentStatus === 'delivered') delivered += 1
    else if (order.shipmentStatus === 'cancelled') cancelled += 1
  }
  return { delivered, cancelled, inProgress: orders.length - delivered - cancelled, total: orders.length }
}

// One bar of the monthly chart: the first-of-month timestamp (so the page can
// format a locale-aware short month label) and how many orders were created that
// month.
export interface MonthlyBucket {
  monthStart: number
  count: number
}

// Orders per calendar month for the last `months` months, oldest-first and
// ending with the current month. Always spans the fixed window regardless of the
// period selector — "when is my season" reads only across a full year, and a
// one-month period would collapse the chart to a single bar. Months with no
// orders are present with count 0 so the axis never has gaps.
export const ordersPerMonth = (orders: Order[], now: number, months: number): MonthlyBucket[] => {
  const d = new Date(now)
  const buckets: MonthlyBucket[] = []
  // Build the window oldest-first: months-1 months back through the current one.
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(d.getFullYear(), d.getMonth() - i, 1)
    buckets.push({ monthStart: start.getTime(), count: 0 })
  }
  const firstStart = buckets[0].monthStart
  for (const order of orders) {
    if (order.dateCreated < firstStart) continue
    const od = new Date(order.dateCreated)
    const monthStart = new Date(od.getFullYear(), od.getMonth(), 1).getTime()
    const bucket = buckets.find((b) => b.monthStart === monthStart)
    if (bucket) bucket.count += 1
  }
  return buckets
}
