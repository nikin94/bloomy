// Statistics helpers for the Statistics tab. Everything here is a PURE function
// over an already-loaded, already-owner-scoped order list (fetchOrders drops
// deleted ones) — so the whole tab computes in memory, stays offline-safe, and
// needs no schema change or extra reads. `now` is passed in (never read from the
// clock here) so the helpers are deterministic and unit-testable, and so the page
// can capture a single mount-time timestamp (a render-time Date.now() isn't pure).
import { startOfDay, startOfMonth, endOfMonth, subDays, subMonths } from 'date-fns'
import { parseDateInput } from '@/utils/format'
import type { Currency, Order } from './order'

// The period presets offered in the tab's dropdown, ordered by widening window.
// '30days'/'3months'/'6months'/'12months' are all ROLLING windows ending now
// (e.g. "the last 30 days", not the current calendar month) — rolling reads more
// obviously to the operator than a calendar "this month"/"this year", which
// resets to a near-empty window on the 1st. 'all' has no bounds; 'custom' takes
// its bounds from the two date fields the page shows instead of a fixed boundary.
// The KPI cards + status breakdown follow this; the monthly chart deliberately
// does not (see below).
export const STATS_PRESETS = ['30days', '3months', '6months', '12months', 'all', 'custom'] as const
export type StatsPreset = (typeof STATS_PRESETS)[number]

// A resolved date window: inclusive [start, end] ms bounds; either side null
// means "unbounded" (open) on that side.
export interface DateRange {
  start: number | null
  end: number | null
}

// Resolve a NON-custom preset to a date window. Every window is a ROLLING span
// ending now: '30days' starts at midnight 30 days back; '3months'/'6months'/
// '12months' start at midnight the same day-of-month 3/6/12 months back. All are
// open-ended (end null, i.e. up to now). 'all' is fully open. 'custom' has no
// fixed window here (the page supplies it via customRange), so it falls through to
// fully open — a safe default if ever resolved directly. Built from local calendar
// parts (midnight boundaries) so the windows match the operator's clock, not UTC.
export const presetRange = (preset: StatsPreset, now: number): DateRange => {
  const d = new Date(now)
  // subDays back to the same clock day, then startOfDay for the midnight boundary.
  if (preset === '30days') return { start: startOfDay(subDays(d, 30)).getTime(), end: null }
  // The N-month starts stay on raw month arithmetic ON PURPOSE: `new Date(y, m-N, day)`
  // OVERFLOWS a shorter target month (e.g. 31 May − 3mo → "31 Feb" → 3 Mar), whereas
  // date-fns `subMonths` CLAMPS (→ 28 Feb). Keeping the raw form preserves the exact
  // rolling-window boundary the tab has always produced; only 30days converts cleanly.
  if (preset === '3months') return { start: new Date(d.getFullYear(), d.getMonth() - 3, d.getDate()).getTime(), end: null }
  if (preset === '6months') return { start: new Date(d.getFullYear(), d.getMonth() - 6, d.getDate()).getTime(), end: null }
  if (preset === '12months') return { start: new Date(d.getFullYear(), d.getMonth() - 12, d.getDate()).getTime(), end: null }
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
    // startOfMonth = its first ms (00:00:00.000 on the 1st); endOfMonth = the last ms
    // (23:59:59.999 on the final day, so a 28/29/30/31-day month lands exactly right).
    start: startOfMonth(d).getTime(),
    end: endOfMonth(d).getTime(),
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
// progress (the non-terminal order status — processing). This is the
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
    if (order.status === 'delivered') delivered += 1
    else if (order.status === 'cancelled') cancelled += 1
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
  // startOfMonth(subMonths(...)) is exactly the raw `new Date(y, m-i, 1)`: pinning to
  // the 1st sidesteps subMonths' short-month clamping, so every step lands on the
  // right calendar month's first ms.
  for (let i = months - 1; i >= 0; i--) {
    const start = startOfMonth(subMonths(d, i))
    buckets.push({ monthStart: start.getTime(), count: 0 })
  }
  const firstStart = buckets[0].monthStart
  for (const order of orders) {
    if (order.dateCreated < firstStart) continue
    const monthStart = startOfMonth(new Date(order.dateCreated)).getTime()
    const bucket = buckets.find((b) => b.monthStart === monthStart)
    if (bucket) bucket.count += 1
  }
  return buckets
}
