import { describe, it, expect } from 'vitest'
import {
  getSubtotalMinor,
  getTotalMinor,
  buildOrderColumns,
  plantsByValueDesc,
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

describe('plantsByValueDesc', () => {
  it('orders plants by line value (unit price × quantity), most valuable first', () => {
    const ordered = plantsByValueDesc([
      { name: 'Роза', quantity: 2, unitPriceMinor: 15000 }, // 30000
      { name: 'Фикус', quantity: 1, unitPriceMinor: 50000 }, // 50000 — pricier
    ])
    expect(ordered.map((p) => p.name)).toEqual(['Фикус', 'Роза'])
  })

  it('returns a copy without mutating the input', () => {
    const input = [
      { name: 'Роза', quantity: 1, unitPriceMinor: 1000 },
      { name: 'Фикус', quantity: 1, unitPriceMinor: 9000 },
    ]
    plantsByValueDesc(input)
    expect(input.map((p) => p.name)).toEqual(['Роза', 'Фикус'])
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
