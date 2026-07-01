// Statistics helpers for the Statistics tab. Everything here is a PURE function
// over an already-loaded, already-owner-scoped order list (fetchOrders drops
// deleted ones) — so the whole tab computes in memory, stays offline-safe, and
// needs no schema change or extra reads. `now` is passed in (never read from the
// clock here) so the helpers are deterministic and unit-testable, and so the page
// can capture a single mount-time timestamp (a render-time Date.now() isn't pure).
import { parseDateInput } from '../utils/format'
import type { Currency, Order } from './order'

// The period presets offered in the tab's dropdown, ordered by widening window.
// 'month'/'year' are the current calendar month/year (local time); '3months'/
// '6months' are ROLLING windows ending now (the last 3/6 months, not calendar
// quarters); 'all' has no bounds; 'custom' takes its bounds from the two date
// fields the page shows instead of a fixed boundary. The KPI cards + status
// breakdown follow this; the monthly chart deliberately does not (see below).
export const STATS_PRESETS = ['month', '3months', '6months', 'year', 'all', 'custom'] as const
export type StatsPreset = (typeof STATS_PRESETS)[number]

// A resolved date window: inclusive [start, end] ms bounds; either side null
// means "unbounded" (open) on that side.
export interface DateRange {
  start: number | null
  end: number | null
}

// Resolve a NON-custom preset to a date window. 'month'/'year' start at the first
// of the current calendar month/year; '3months'/'6months' are rolling windows
// starting exactly 3/6 months back from today; all four are open-ended (end null,
// i.e. up to now). 'all' is fully open. 'custom' has no fixed window here (the
// page supplies it via customRange), so it falls through to fully open — a safe
// default if ever resolved directly. Uses local calendar boundaries so the
// windows match the operator's calendar, not UTC.
export const presetRange = (preset: StatsPreset, now: number): DateRange => {
  const d = new Date(now)
  if (preset === 'month') return { start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), end: null }
  if (preset === '3months') return { start: new Date(d.getFullYear(), d.getMonth() - 3, d.getDate()).getTime(), end: null }
  if (preset === '6months') return { start: new Date(d.getFullYear(), d.getMonth() - 6, d.getDate()).getTime(), end: null }
  if (preset === 'year') return { start: new Date(d.getFullYear(), 0, 1).getTime(), end: null }
  return { start: null, end: null } // 'all' (and 'custom' — page overrides)
}

// Build a window from the two custom date fields (each `yyyy-mm-dd` or empty).
// An empty side is left open, so a `from` alone means "since that day" and a `to`
// alone means "up to and including that day". The `to` day is fully included
// (parseDateInput's 'end' edge is the last ms of the day).
export const customRange = (from: string, to: string): DateRange => ({
  start: parseDateInput(from, 'start'),
  end: parseDateInput(to, 'end'),
})

// Inclusive [start, end] ms bounds of the calendar month that a first-of-month
// timestamp belongs to. Used when a monthly-chart bar is clicked: the orders list
// is opened filtered to exactly that month (start = its first ms, end = the last
// ms of its final day).
export const monthBounds = (monthStart: number): DateRange => {
  const d = new Date(monthStart)
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime(),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime(),
  }
}

// Orders whose dateCreated falls within the window (inclusive on both bounds; a
// null bound is open). A window with start > end simply matches nothing.
export const filterOrdersByRange = (orders: Order[], range: DateRange): Order[] =>
  orders.filter(
    (o) =>
      (range.start === null || o.dateCreated >= range.start) &&
      (range.end === null || o.dateCreated <= range.end),
  )

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
