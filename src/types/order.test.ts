import { describe, it, expect } from 'vitest'
import {
  getSubtotalMinor,
  getTotalMinor,
  buildOrderColumns,
  plantsByValueDesc,
  filterOrders,
  isOrderFilterActive,
  isModalFilterActive,
  isTerminalShipmentStatus,
  resolveCompletedAt,
  EMPTY_ORDER_FILTER,
  DELIVERY_METHOD_OPTIONS,
  STORED_ORDER_SCHEMA,
} from './order'
import type { Order } from './order'

// A valid Order with sensible defaults; pass overrides per test.
const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'order-1',
  number: 1,
  dateCreated: 0,
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

describe('getSubtotalMinor', () => {
  it('sums quantity × unit price across line items', () => {
    const order = makeOrder({
      plants: [
        { name: 'Роза', quantity: 2, unitPriceMinor: 5000 },
        { name: 'Фикус', quantity: 1, unitPriceMinor: 3000 },
      ],
    })
    expect(getSubtotalMinor(order)).toBe(13000)
  })
})

describe('getTotalMinor', () => {
  it('adds delivery to the items subtotal', () => {
    const order = makeOrder({
      plants: [{ name: 'Роза', quantity: 2, unitPriceMinor: 5000 }],
      deliveryPriceMinor: 20000,
    })
    expect(getTotalMinor(order)).toBe(30000)
  })

  it('equals the subtotal when delivery is free', () => {
    const order = makeOrder({
      plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 9900 }],
      deliveryPriceMinor: 0,
    })
    expect(getTotalMinor(order)).toBe(getSubtotalMinor(order))
  })
})

describe('isTerminalShipmentStatus', () => {
  it('is true only for delivered and cancelled', () => {
    expect(isTerminalShipmentStatus('delivered')).toBe(true)
    expect(isTerminalShipmentStatus('cancelled')).toBe(true)
    expect(isTerminalShipmentStatus('new')).toBe(false)
    expect(isTerminalShipmentStatus('packing')).toBe(false)
    expect(isTerminalShipmentStatus('shipped')).toBe(false)
  })
})

describe('resolveCompletedAt', () => {
  it('stamps now when entering a terminal status without a prior stamp', () => {
    expect(resolveCompletedAt('delivered', undefined, 1700)).toBe(1700)
    expect(resolveCompletedAt('cancelled', undefined, 1700)).toBe(1700)
  })

  it('keeps the original stamp on a re-save while still terminal', () => {
    expect(resolveCompletedAt('delivered', 1000, 9999)).toBe(1000)
  })

  it('clears the stamp when the status is not terminal', () => {
    expect(resolveCompletedAt('new', 1000, 9999)).toBeUndefined()
    expect(resolveCompletedAt('shipped', undefined, 9999)).toBeUndefined()
  })
})

describe('buildOrderColumns', () => {
  it('resolves the customer column via the provided lookup', () => {
    const columns = buildOrderColumns((id) => (id === 'customer-1' ? 'Анна' : '—'))
    const customerColumn = columns.find((c) => c.id === 'customer')
    expect(customerColumn?.format?.(makeOrder())).toBe('Анна')
  })

  it('formats the total column from the derived money model', () => {
    const columns = buildOrderColumns(() => 'Анна')
    const totalColumn = columns.find((c) => c.id === 'total')
    const order = makeOrder({
      plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 9900 }],
      deliveryPriceMinor: 0,
    })
    expect(totalColumn?.format?.(order)).toContain('99,00')
  })

  it('builds every column with exactly one of field or format (discriminated union)', () => {
    const columns = buildOrderColumns(() => 'Анна')
    for (const column of columns) {
      // The type forbids a column with neither (compile-time); assert the data
      // honours it at runtime too — each renders via a field OR a formatter.
      const hasField = 'field' in column && column.field !== undefined
      const hasFormat = 'format' in column && column.format !== undefined
      expect(hasField !== hasFormat).toBe(true) // exactly one
    }
  })
})

describe('plantsByValueDesc', () => {
  it('orders plants by line value (unit price × quantity) descending, without mutating', () => {
    const plants = [
      { name: 'Роза', quantity: 2, unitPriceMinor: 15000 }, // 30000
      { name: 'Фикус', quantity: 1, unitPriceMinor: 50000 }, // 50000
      { name: 'Кактус', quantity: 5, unitPriceMinor: 2000 }, // 10000
    ]
    expect(plantsByValueDesc(plants).map((p) => p.name)).toEqual(['Фикус', 'Роза', 'Кактус'])
    // The input array is left untouched (a copy is sorted).
    expect(plants.map((p) => p.name)).toEqual(['Роза', 'Фикус', 'Кактус'])
  })
})

describe('the plants column', () => {
  const plantsColumn = buildOrderColumns(() => 'Анна').find((c) => c.id === 'plants')

  it('stacks plants priciest-first with the quantity as ×N, omitting it when 1', () => {
    const order = makeOrder({
      plants: [
        { name: 'Роза', quantity: 2, unitPriceMinor: 15000 }, // 30000
        { name: 'Фикус', quantity: 1, unitPriceMinor: 50000 }, // 50000 — pricier, no qty
      ],
    })
    // Newline-joined, most valuable first; the single Фикус shows no quantity.
    expect(plantsColumn?.format?.(order)).toBe('Фикус\nРоза ×2')
  })
})

describe('isOrderFilterActive', () => {
  it('is false for the empty filter', () => {
    expect(isOrderFilterActive(EMPTY_ORDER_FILTER)).toBe(false)
  })

  it('is false when the query is only whitespace and the rest is unset', () => {
    expect(isOrderFilterActive({ ...EMPTY_ORDER_FILTER, query: '   ' })).toBe(false)
  })

  it('is true when any of query / payment / shipment / price is set', () => {
    expect(isOrderFilterActive({ ...EMPTY_ORDER_FILTER, query: 'роза' })).toBe(true)
    expect(isOrderFilterActive({ ...EMPTY_ORDER_FILTER, paymentStatus: 'paid' })).toBe(true)
    expect(isOrderFilterActive({ ...EMPTY_ORDER_FILTER, shipmentStatus: 'shipped' })).toBe(true)
    expect(isOrderFilterActive({ ...EMPTY_ORDER_FILTER, minPriceMinor: 5000 })).toBe(true)
    expect(isOrderFilterActive({ ...EMPTY_ORDER_FILTER, maxPriceMinor: 5000 })).toBe(true)
  })
})

describe('isModalFilterActive', () => {
  it('counts the dialog filters (status + price), not the inline search query', () => {
    // The query is shown inline; the dialog's filter-icon dot reflects the rest.
    expect(isModalFilterActive(EMPTY_ORDER_FILTER)).toBe(false)
    expect(isModalFilterActive({ ...EMPTY_ORDER_FILTER, query: 'роза' })).toBe(false)
    expect(isModalFilterActive({ ...EMPTY_ORDER_FILTER, paymentStatus: 'paid' })).toBe(true)
    expect(isModalFilterActive({ ...EMPTY_ORDER_FILTER, shipmentStatus: 'shipped' })).toBe(true)
    expect(isModalFilterActive({ ...EMPTY_ORDER_FILTER, minPriceMinor: 5000 })).toBe(true)
    expect(isModalFilterActive({ ...EMPTY_ORDER_FILTER, maxPriceMinor: 5000 })).toBe(true)
  })
})

describe('filterOrders', () => {
  const names: Record<string, string> = { 'c-anna': 'Анна', 'c-boris': 'Борис' }
  const getName = (id: string) => names[id] ?? '—'
  const orders = [
    makeOrder({ id: 'o1', number: 1, customerId: 'c-anna', paymentStatus: 'paid', shipmentStatus: 'new' }),
    makeOrder({ id: 'o2', number: 2, customerId: 'c-boris', paymentStatus: 'pending', shipmentStatus: 'shipped' }),
    makeOrder({ id: 'o3', number: 13, customerId: 'c-anna', paymentStatus: 'pending', shipmentStatus: 'new' }),
  ]

  it('returns every order for the empty filter', () => {
    expect(filterOrders(orders, EMPTY_ORDER_FILTER, getName).map((o) => o.id)).toEqual(['o1', 'o2', 'o3'])
  })

  it('matches the order number as a substring', () => {
    // "1" matches order 1 and order 13.
    expect(filterOrders(orders, { ...EMPTY_ORDER_FILTER, query: '1' }, getName).map((o) => o.id)).toEqual(['o1', 'o3'])
  })

  it('matches the resolved customer name, case-insensitively', () => {
    expect(filterOrders(orders, { ...EMPTY_ORDER_FILTER, query: 'анна' }, getName).map((o) => o.id)).toEqual(['o1', 'o3'])
  })

  it('filters by an exact status', () => {
    expect(
      filterOrders(orders, { ...EMPTY_ORDER_FILTER, shipmentStatus: 'shipped' }, getName).map((o) => o.id),
    ).toEqual(['o2'])
  })

  it('combines the query with status filters (AND)', () => {
    expect(
      filterOrders(orders, { ...EMPTY_ORDER_FILTER, query: 'анна', paymentStatus: 'pending' }, getName).map((o) => o.id),
    ).toEqual(['o3'])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterOrders(orders, { ...EMPTY_ORDER_FILTER, query: 'нет такого' }, getName)).toEqual([])
  })

  it('filters by the price range (order total in minor units)', () => {
    // Three orders with distinct totals (plant subtotal + delivery).
    const priced = [
      makeOrder({ id: 'cheap', plants: [{ name: 'a', quantity: 1, unitPriceMinor: 10000 }] }), // 10000
      makeOrder({ id: 'mid', plants: [{ name: 'b', quantity: 1, unitPriceMinor: 50000 }] }), // 50000
      makeOrder({ id: 'pricey', plants: [{ name: 'c', quantity: 1, unitPriceMinor: 90000 }] }), // 90000
    ]
    // Lower bound only.
    expect(
      filterOrders(priced, { ...EMPTY_ORDER_FILTER, minPriceMinor: 50000 }, getName).map((o) => o.id),
    ).toEqual(['mid', 'pricey'])
    // Upper bound only.
    expect(
      filterOrders(priced, { ...EMPTY_ORDER_FILTER, maxPriceMinor: 50000 }, getName).map((o) => o.id),
    ).toEqual(['cheap', 'mid'])
    // Both bounds.
    expect(
      filterOrders(priced, { ...EMPTY_ORDER_FILTER, minPriceMinor: 20000, maxPriceMinor: 60000 }, getName).map(
        (o) => o.id,
      ),
    ).toEqual(['mid'])
  })
})

describe('DELIVERY_METHOD_OPTIONS', () => {
  it('is alphabetical by Russian label with "Другое" pinned last', () => {
    expect(DELIVERY_METHOD_OPTIONS.map((o) => o.label)).toEqual([
      'Автобус',
      'Почта',
      'Самовывоз',
      'СДЭК',
      'Такси',
      'Другое',
    ])
  })
})

describe('STORED_ORDER_SCHEMA', () => {
  // A plain Firestore document body (no id) that satisfies the schema.
  const validDoc = () => ({
    number: 1,
    dateCreated: 0,
    ownerId: 'user-1',
    customerId: 'customer-1',
    address: '',
    plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 5000 }],
    paymentMethod: 'cash',
    deliveryMethod: 'taxi',
    deliveryPriceMinor: 0,
    currency: 'RUB',
    paymentStatus: 'pending',
    shipmentStatus: 'new',
  })

  it('accepts a valid document', () => {
    expect(STORED_ORDER_SCHEMA.safeParse(validDoc()).success).toBe(true)
  })

  it('defaults deliveryMethod to "post" on legacy documents that lack it', () => {
    const legacy: Record<string, unknown> = { ...validDoc() }
    delete legacy.deliveryMethod
    const parsed = STORED_ORDER_SCHEMA.parse(legacy)
    expect(parsed.deliveryMethod).toBe('post')
  })

  it('stays valid without completedAt and accepts it when present', () => {
    // Active/legacy orders have no completion stamp; finished ones carry a number.
    expect(STORED_ORDER_SCHEMA.safeParse(validDoc()).success).toBe(true)
    expect(STORED_ORDER_SCHEMA.safeParse({ ...validDoc(), completedAt: 1700 }).success).toBe(true)
  })

  it('rejects an order with no plants', () => {
    expect(STORED_ORDER_SCHEMA.safeParse({ ...validDoc(), plants: [] }).success).toBe(false)
  })

  it('rejects a non-integer unit price', () => {
    const doc = { ...validDoc(), plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 50.5 }] }
    expect(STORED_ORDER_SCHEMA.safeParse(doc).success).toBe(false)
  })

  it('rejects a currency other than RUB', () => {
    expect(STORED_ORDER_SCHEMA.safeParse({ ...validDoc(), currency: 'USD' }).success).toBe(false)
  })
})
