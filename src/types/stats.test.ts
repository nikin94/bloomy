import { describe, it, expect } from 'vitest'
import {
  periodStart,
  filterOrdersByPeriod,
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
  shipmentStatus: 'new',
  ...overrides,
})

describe('periodStart', () => {
  it('returns the first of the current month for "month"', () => {
    expect(periodStart('month', NOW)).toBe(MONTH_START)
  })
  it('returns the first of the current year for "year"', () => {
    expect(periodStart('year', NOW)).toBe(YEAR_START)
  })
  it('returns null for "all" (no lower bound)', () => {
    expect(periodStart('all', NOW)).toBeNull()
  })
})

describe('filterOrdersByPeriod', () => {
  const thisMonth = makeOrder({ id: 'm', dateCreated: NOW })
  const earlierThisYear = makeOrder({ id: 'y', dateCreated: new Date(2026, 2, 10).getTime() })
  const lastYear = makeOrder({ id: 'o', dateCreated: new Date(2025, 5, 1).getTime() })
  const orders = [thisMonth, earlierThisYear, lastYear]

  it('keeps only orders created this month for "month"', () => {
    expect(filterOrdersByPeriod(orders, 'month', NOW).map((o) => o.id)).toEqual(['m'])
  })
  it('keeps this-year orders for "year"', () => {
    expect(filterOrdersByPeriod(orders, 'year', NOW).map((o) => o.id).sort()).toEqual(['m', 'y'])
  })
  it('keeps everything for "all"', () => {
    expect(filterOrdersByPeriod(orders, 'all', NOW)).toHaveLength(3)
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
      makeOrder({ shipmentStatus: 'new' }),
      makeOrder({ shipmentStatus: 'packing' }),
      makeOrder({ shipmentStatus: 'shipped' }),
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
