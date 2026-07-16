import { describe, it, expect } from 'vitest'
import {
  presetRange,
  customRange,
  filterOrdersByRange,
  monthBounds,
  deliveryByCurrencyMinor,
  statusBreakdown,
  ordersPerMonth,
} from './stats'
import type { Order } from './order'

// A fixed "now" (15 July 2026, local) so period boundaries and month buckets are
// deterministic regardless of when the suite runs.
const NOW = new Date(2026, 6, 15, 12, 0, 0).getTime()
const MONTH_START = new Date(2026, 6, 1).getTime()
const YEAR_START = new Date(2026, 0, 1).getTime()

const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'order-1',
  number: 1,
  dateCreated: NOW,
  ownerId: 'user-1',
  customerId: 'customer-1',
  address: 'ул. Пушкина, 1',
  plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 0 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'processing',
  ...overrides,
})

describe('presetRange', () => {
  it('rolls back exactly 30 days from today for "30days", open-ended', () => {
    // NOW = 15 Jul 2026 → 15 Jun 2026.
    expect(presetRange('30days', NOW)).toEqual({ start: new Date(2026, 6, 15 - 30).getTime(), end: null })
  })
  it('rolls back exactly 3 months from today for "3months", open-ended', () => {
    // NOW = 15 Jul 2026 → 15 Apr 2026.
    expect(presetRange('3months', NOW)).toEqual({ start: new Date(2026, 3, 15).getTime(), end: null })
  })
  it('rolls back exactly 6 months from today for "6months", open-ended', () => {
    // NOW = 15 Jul 2026 → 15 Jan 2026.
    expect(presetRange('6months', NOW)).toEqual({ start: new Date(2026, 0, 15).getTime(), end: null })
  })
  it('rolls back exactly 12 months from today for "12months", open-ended', () => {
    // NOW = 15 Jul 2026 → 15 Jul 2025.
    expect(presetRange('12months', NOW)).toEqual({ start: new Date(2025, 6, 15).getTime(), end: null })
  })
  it('is fully open for "all"', () => {
    expect(presetRange('all', NOW)).toEqual({ start: null, end: null })
  })
  it('is fully open for "custom" (the page supplies the window)', () => {
    expect(presetRange('custom', NOW)).toEqual({ start: null, end: null })
  })
})

describe('customRange', () => {
  it('makes the `to` day inclusive (end-of-day) and the `from` day start-of-day', () => {
    const range = customRange('2026-03-10', '2026-03-20')
    expect(range.start).toBe(new Date(2026, 2, 10, 0, 0, 0, 0).getTime())
    expect(range.end).toBe(new Date(2026, 2, 20, 23, 59, 59, 999).getTime())
  })
  it('leaves an empty side open', () => {
    expect(customRange('2026-03-10', '')).toEqual({
      start: new Date(2026, 2, 10, 0, 0, 0, 0).getTime(),
      end: null,
    })
    expect(customRange('', '2026-03-20')).toEqual({
      start: null,
      end: new Date(2026, 2, 20, 23, 59, 59, 999).getTime(),
    })
  })
  it('is fully open when both sides are empty', () => {
    expect(customRange('', '')).toEqual({ start: null, end: null })
  })
})

describe('monthBounds', () => {
  it('returns the inclusive [start, end] of the month a first-of-month ts belongs to', () => {
    const { start, end } = monthBounds(MONTH_START) // July 2026
    expect(start).toBe(new Date(2026, 6, 1, 0, 0, 0, 0).getTime())
    expect(end).toBe(new Date(2026, 6, 31, 23, 59, 59, 999).getTime())
  })
  it('handles a February in a non-leap year (28 days)', () => {
    const { end } = monthBounds(new Date(2026, 1, 1).getTime())
    expect(end).toBe(new Date(2026, 1, 28, 23, 59, 59, 999).getTime())
  })
})

describe('filterOrdersByRange', () => {
  const thisMonth = makeOrder({ id: 'm', dateCreated: NOW })
  const earlierThisYear = makeOrder({ id: 'y', dateCreated: new Date(2026, 2, 10).getTime() })
  const lastYear = makeOrder({ id: 'o', dateCreated: new Date(2025, 5, 1).getTime() })
  const orders = [thisMonth, earlierThisYear, lastYear]

  it('applies a preset window (last 30 days)', () => {
    // 30-day window from 15 Jul 2026 → back to 15 Jun; only the NOW order lands in it.
    expect(filterOrdersByRange(orders, presetRange('30days', NOW)).map((o) => o.id)).toEqual(['m'])
  })
  it('keeps everything for a fully-open window', () => {
    expect(filterOrdersByRange(orders, { start: null, end: null })).toHaveLength(3)
  })
  it('keeps orders within an inclusive custom window (both bounds)', () => {
    // March–June 2026 → only the March order qualifies.
    const range = customRange('2026-03-01', '2026-06-30')
    expect(filterOrdersByRange(orders, range).map((o) => o.id)).toEqual(['y'])
  })
  it('includes an order dated on the `to` day itself (end-of-day inclusive)', () => {
    const onEdge = makeOrder({ id: 'e', dateCreated: new Date(2026, 2, 10, 18, 30).getTime() })
    const range = customRange('2026-03-10', '2026-03-10')
    expect(filterOrdersByRange([onEdge], range).map((o) => o.id)).toEqual(['e'])
  })
  it('excludes an order at midnight of the day after `to` (upper bound is tight)', () => {
    // Nails the "end-of-day inclusive" contract from the boundary side: an order
    // one millisecond into `to + 1 day` must fall outside the window.
    const nextMidnight = makeOrder({ id: 'x', dateCreated: new Date(2026, 2, 21, 0, 0, 0, 0).getTime() })
    const range = customRange('2026-03-20', '2026-03-20')
    expect(filterOrdersByRange([nextMidnight], range)).toHaveLength(0)
  })
  it('matches nothing when start is after end (inverted window)', () => {
    expect(filterOrdersByRange(orders, { start: NOW, end: YEAR_START })).toHaveLength(0)
  })
})

describe('deliveryByCurrencyMinor', () => {
  it('sums PAID delivery per currency, ignoring unpaid orders', () => {
    const orders = [
      makeOrder({ paymentStatus: 'paid', currency: 'RUB', deliveryPriceMinor: 30000 }),
      makeOrder({ paymentStatus: 'paid', currency: 'RUB', deliveryPriceMinor: 20000 }),
      makeOrder({ paymentStatus: 'paid', currency: 'USD', deliveryPriceMinor: 500 }),
      // Unpaid → excluded even though it has a delivery charge.
      makeOrder({ paymentStatus: 'pending', currency: 'RUB', deliveryPriceMinor: 99999 }),
    ]
    const result = deliveryByCurrencyMinor(orders)
    expect(result.get('RUB')).toBe(50000)
    expect(result.get('USD')).toBe(500)
    expect(result.has('EUR')).toBe(false)
  })
})

describe('statusBreakdown', () => {
  it('splits orders into delivered / cancelled / in-progress', () => {
    const orders = [
      makeOrder({ shipmentStatus: 'delivered' }),
      makeOrder({ shipmentStatus: 'delivered' }),
      makeOrder({ shipmentStatus: 'cancelled' }),
      makeOrder({ shipmentStatus: 'processing' }),
      makeOrder({ shipmentStatus: 'processing' }),
      makeOrder({ shipmentStatus: 'processing' }),
    ]
    expect(statusBreakdown(orders)).toEqual({
      delivered: 2,
      cancelled: 1,
      inProgress: 3,
      total: 6,
    })
  })
  it('is all-zero for an empty list', () => {
    expect(statusBreakdown([])).toEqual({ delivered: 0, cancelled: 0, inProgress: 0, total: 0 })
  })
})

describe('ordersPerMonth', () => {
  it('returns `months` buckets, oldest-first, ending with the current month', () => {
    const buckets = ordersPerMonth([], NOW, 12)
    expect(buckets).toHaveLength(12)
    expect(buckets[11].monthStart).toBe(MONTH_START) // last bucket = current month
    expect(buckets[0].monthStart).toBe(new Date(2025, 7, 1).getTime()) // 11 months back
  })

  it('counts orders into their calendar month and leaves empty months at 0', () => {
    const orders = [
      makeOrder({ dateCreated: NOW }), // July 2026
      makeOrder({ dateCreated: new Date(2026, 6, 2).getTime() }), // July 2026
      makeOrder({ dateCreated: new Date(2026, 5, 20).getTime() }), // June 2026
    ]
    const buckets = ordersPerMonth(orders, NOW, 12)
    const july = buckets.find((b) => b.monthStart === MONTH_START)
    const june = buckets.find((b) => b.monthStart === new Date(2026, 5, 1).getTime())
    expect(july?.count).toBe(2)
    expect(june?.count).toBe(1)
    // A month with no orders stays at 0.
    expect(buckets.find((b) => b.monthStart === new Date(2026, 4, 1).getTime())?.count).toBe(0)
  })

  it('ignores orders older than the window', () => {
    const orders = [makeOrder({ dateCreated: new Date(2024, 0, 1).getTime() })]
    expect(ordersPerMonth(orders, NOW, 12).reduce((sum, b) => sum + b.count, 0)).toBe(0)
  })
})
