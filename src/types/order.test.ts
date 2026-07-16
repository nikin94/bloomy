import { describe, it, expect } from 'vitest'
import {
  getSubtotalMinor,
  getTotalMinor,
  plantsByValueDesc,
  filterOrders,
  isOrderFilterActive,
  isModalFilterActive,
  isTerminalOrderStatus,
  resolveCompletedAt,
  EMPTY_ORDER_FILTER,
  isOrderDeleted,
  trashDaysLeft,
  TRASH_RETENTION_DAYS,
  revenueByCurrencyMinor,
  topPlantsByQuantity,
  collectPlantNames,
  giftsByDateDesc,
  STORED_ORDER_SCHEMA,
} from './order'
import type { Order } from './order'
import { buildOrderColumns } from '@/components/DataTable/orderColumns'
import {
  deliveryMethodOptions,
  paymentStatusOptions,
  paymentMethodOptions,
  currencyOptions,
} from '@/lib/orderLabels'
import i18n from '@/i18n/config'

// Label/header lookups need a translate fn bound to the `order` namespace; the
// shared test i18n instance defaults to ru, so labels resolve to Russian.
const t = i18n.getFixedT(null, 'order')

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
  status: 'processing',
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

describe('isTerminalOrderStatus', () => {
  it('is true only for delivered and cancelled', () => {
    expect(isTerminalOrderStatus('delivered')).toBe(true)
    expect(isTerminalOrderStatus('cancelled')).toBe(true)
    expect(isTerminalOrderStatus('processing')).toBe(false)
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
    expect(resolveCompletedAt('processing', 1000, 9999)).toBeUndefined()
    expect(resolveCompletedAt('processing', undefined, 9999)).toBeUndefined()
  })
})

describe('buildOrderColumns', () => {
  it('resolves the customer column via the provided lookup', () => {
    const columns = buildOrderColumns((id) => (id === 'customer-1' ? 'Анна' : '—'), t)
    const customerColumn = columns.find((c) => c.id === 'customer')
    expect(customerColumn?.format?.(makeOrder())).toBe('Анна')
  })

  it('formats the total column from the derived money model', () => {
    const columns = buildOrderColumns(() => 'Анна', t)
    const totalColumn = columns.find((c) => c.id === 'total')
    const order = makeOrder({
      plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 9900 }],
      deliveryPriceMinor: 0,
    })
    expect(totalColumn?.format?.(order)).toContain('99,00')
  })

  it('builds every column with exactly one of field or format (discriminated union)', () => {
    const columns = buildOrderColumns(() => 'Анна', t)
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
  const plantsColumn = buildOrderColumns(() => 'Анна', t).find((c) => c.id === 'plants')

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

  it('is true when any of query / payment status / order status / price is set', () => {
    expect(isOrderFilterActive({ ...EMPTY_ORDER_FILTER, query: 'роза' })).toBe(true)
    expect(isOrderFilterActive({ ...EMPTY_ORDER_FILTER, paymentStatus: 'paid' })).toBe(true)
    expect(isOrderFilterActive({ ...EMPTY_ORDER_FILTER, status: 'processing' })).toBe(true)
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
    expect(isModalFilterActive({ ...EMPTY_ORDER_FILTER, status: 'processing' })).toBe(true)
    expect(isModalFilterActive({ ...EMPTY_ORDER_FILTER, currency: 'USD' })).toBe(true)
    expect(isModalFilterActive({ ...EMPTY_ORDER_FILTER, minPriceMinor: 5000 })).toBe(true)
    expect(isModalFilterActive({ ...EMPTY_ORDER_FILTER, maxPriceMinor: 5000 })).toBe(true)
    expect(isModalFilterActive({ ...EMPTY_ORDER_FILTER, minDate: 1000 })).toBe(true)
    expect(isModalFilterActive({ ...EMPTY_ORDER_FILTER, maxDate: 1000 })).toBe(true)
  })
})

describe('filterOrders', () => {
  const names: Record<string, string> = { 'c-anna': 'Анна', 'c-boris': 'Борис' }
  const getName = (id: string) => names[id] ?? '—'
  const orders = [
    makeOrder({ id: 'o1', number: 1, customerId: 'c-anna', paymentStatus: 'paid', status: 'processing' }),
    makeOrder({ id: 'o2', number: 2, customerId: 'c-boris', paymentStatus: 'pending', status: 'delivered' }),
    makeOrder({ id: 'o3', number: 13, customerId: 'c-anna', paymentStatus: 'pending', status: 'processing' }),
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
      filterOrders(orders, { ...EMPTY_ORDER_FILTER, status: 'delivered' }, getName).map((o) => o.id),
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

  it('filters by the order currency', () => {
    const mixed = [
      makeOrder({ id: 'rub', currency: 'RUB' }),
      makeOrder({ id: 'usd', currency: 'USD' }),
      makeOrder({ id: 'eur', currency: 'EUR' }),
    ]
    expect(
      filterOrders(mixed, { ...EMPTY_ORDER_FILTER, currency: 'USD' }, getName).map((o) => o.id),
    ).toEqual(['usd'])
    // The empty currency matches every order.
    expect(filterOrders(mixed, EMPTY_ORDER_FILTER, getName).map((o) => o.id)).toEqual([
      'rub',
      'usd',
      'eur',
    ])
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

  it('filters by the creation-date range (inclusive on both bounds)', () => {
    const dated = [
      makeOrder({ id: 'jan', dateCreated: new Date(2026, 0, 15).getTime() }),
      makeOrder({ id: 'jun', dateCreated: new Date(2026, 5, 15).getTime() }),
      makeOrder({ id: 'dec', dateCreated: new Date(2026, 11, 15).getTime() }),
    ]
    const min = new Date(2026, 5, 1, 0, 0, 0, 0).getTime()
    const max = new Date(2026, 5, 30, 23, 59, 59, 999).getTime()
    // A month window keeps only the order created that month.
    expect(
      filterOrders(dated, { ...EMPTY_ORDER_FILTER, minDate: min, maxDate: max }, getName).map((o) => o.id),
    ).toEqual(['jun'])
    // Lower bound only — everything from June onwards.
    expect(
      filterOrders(dated, { ...EMPTY_ORDER_FILTER, minDate: min }, getName).map((o) => o.id),
    ).toEqual(['jun', 'dec'])
    // Upper bound only — everything up to end of June.
    expect(
      filterOrders(dated, { ...EMPTY_ORDER_FILTER, maxDate: max }, getName).map((o) => o.id),
    ).toEqual(['jan', 'jun'])
  })
})

describe('deliveryMethodOptions', () => {
  it('is alphabetical by translated label with "Другое" pinned last', () => {
    expect(deliveryMethodOptions(t).map((o) => o.label)).toEqual([
      'Автобус',
      'Почта',
      'Самовывоз',
      'СДЭК',
      'Такси',
      'Другое',
    ])
  })
})

describe('currencyOptions', () => {
  it('labels each currency with its localized name and symbol glyph', () => {
    // ru labels (the shared test i18n defaults to ru); the symbol comes from Intl.
    expect(currencyOptions(t)).toEqual([
      { value: 'RUB', label: 'Рубли (₽)' },
      { value: 'USD', label: 'Доллары ($)' },
      { value: 'EUR', label: 'Евро (€)' },
    ])
  })
})

describe('status/method option + label helpers', () => {
  it('builds value→label options resolved from the order namespace', () => {
    expect(paymentStatusOptions(t)).toEqual([
      { value: 'pending', label: 'Ожидает' },
      { value: 'paid', label: 'Оплачен' },
      { value: 'refunded', label: 'Возврат' },
    ])
    expect(paymentMethodOptions(t).map((o) => o.label)).toEqual(['Наличные', 'Карта', 'Перевод'])
  })

  it('translates the table headers and the status cells', () => {
    const columns = buildOrderColumns(() => 'Анна', t)
    expect(columns.find((c) => c.id === 'customer')?.header).toBe('Клиент')
    expect(columns.find((c) => c.id === 'paymentStatus')?.header).toBe('Оплата')
    // The payment-status cell renders the translated label, not the raw value.
    const payColumn = columns.find((c) => c.id === 'paymentStatus')
    expect(payColumn?.format?.(makeOrder({ paymentStatus: 'paid' }))).toBe('Оплачен')
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
    status: 'processing',
  })

  it('accepts a valid document', () => {
    expect(STORED_ORDER_SCHEMA.safeParse(validDoc()).success).toBe(true)
  })

  it('lifts the legacy shipmentStatus FIELD into status (pre-rename documents)', () => {
    // Documents written before the field rename hold the status under
    // `shipmentStatus`; the schema's preprocess lifts it so they keep parsing
    // until migrateOrderStatuses has renamed the field in storage.
    const legacy: Record<string, unknown> = { ...validDoc() }
    delete legacy.status
    legacy.shipmentStatus = 'shipped'
    const parsed = STORED_ORDER_SCHEMA.parse(legacy)
    // Lifted AND value-normalized in one pass; the old key is stripped.
    expect(parsed.status).toBe('processing')
    expect(parsed).not.toHaveProperty('shipmentStatus')
    // When both fields are somehow present, the new one wins.
    const both = { ...validDoc(), status: 'delivered', shipmentStatus: 'new' }
    expect(STORED_ORDER_SCHEMA.parse(both).status).toBe('delivered')
  })

  it('normalizes every legacy status value to "processing" on parse', () => {
    // Documents written before the three-state model still carry these values;
    // parseOrder must keep reading them (the `packing` lesson) until
    // migrateOrderStatuses has rewritten every account's stored data.
    for (const legacy of ['new', 'packing', 'shipped']) {
      const parsed = STORED_ORDER_SCHEMA.parse({ ...validDoc(), status: legacy })
      expect(parsed.status).toBe('processing')
    }
  })

  it('keeps the three current statuses as-is and rejects an unknown one', () => {
    for (const status of ['processing', 'delivered', 'cancelled']) {
      const parsed = STORED_ORDER_SCHEMA.parse({ ...validDoc(), status: status })
      expect(parsed.status).toBe(status)
    }
    expect(
      STORED_ORDER_SCHEMA.safeParse({ ...validDoc(), status: 'lost' }).success,
    ).toBe(false)
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

  it('accepts every supported currency (RUB/USD/EUR)', () => {
    for (const currency of ['RUB', 'USD', 'EUR']) {
      expect(STORED_ORDER_SCHEMA.safeParse({ ...validDoc(), currency }).success).toBe(true)
    }
  })

  it('rejects an unsupported currency', () => {
    expect(STORED_ORDER_SCHEMA.safeParse({ ...validDoc(), currency: 'GBP' }).success).toBe(false)
  })

  it('stays valid without gifts (pre-gift documents) and accepts a gift when present', () => {
    // `gifts` was added after orders already existed — optional, so no migration.
    expect(STORED_ORDER_SCHEMA.safeParse(validDoc()).success).toBe(true)
    const withGift = {
      ...validDoc(),
      gifts: [{ name: 'Суккулент', quantity: 1, unitPriceMinor: 0 }],
    }
    expect(STORED_ORDER_SCHEMA.safeParse(withGift).success).toBe(true)
  })

  it('rejects a malformed gift entry (same item shape as plants)', () => {
    const doc = { ...validDoc(), gifts: [{ name: '', quantity: 1, unitPriceMinor: 0 }] }
    expect(STORED_ORDER_SCHEMA.safeParse(doc).success).toBe(false)
  })
})

describe('isOrderDeleted', () => {
  it('is false for an active order (no deletedAt, no isDeleted)', () => {
    expect(isOrderDeleted(makeOrder())).toBe(false)
  })

  it('is true when deletedAt is set (the canonical signal)', () => {
    expect(isOrderDeleted(makeOrder({ deletedAt: 1700 }))).toBe(true)
  })

  it('still honours the legacy isDeleted flag (no deletedAt)', () => {
    expect(isOrderDeleted(makeOrder({ isDeleted: true }))).toBe(true)
  })
})

describe('trashDaysLeft', () => {
  const DAY = 24 * 60 * 60 * 1000

  it('returns null for an order with no deletedAt (legacy / active)', () => {
    expect(trashDaysLeft(makeOrder(), 0)).toBeNull()
    expect(trashDaysLeft(makeOrder({ isDeleted: true }), 0)).toBeNull()
  })

  it('counts whole days left in the retention window, rounding up', () => {
    const deletedAt = 1_000_000
    // Just deleted: the full window remains.
    expect(trashDaysLeft(makeOrder({ deletedAt }), deletedAt)).toBe(TRASH_RETENTION_DAYS)
    // A day and a half elapsed → 28.5 left → rounds up to 29.
    expect(trashDaysLeft(makeOrder({ deletedAt }), deletedAt + 1.5 * DAY)).toBe(
      TRASH_RETENTION_DAYS - 1,
    )
  })

  it('floors at 0 for an expired-but-not-yet-purged order (never negative)', () => {
    const deletedAt = 1_000_000
    const past = deletedAt + (TRASH_RETENTION_DAYS + 5) * DAY
    expect(trashDaysLeft(makeOrder({ deletedAt }), past)).toBe(0)
  })
})

describe('revenueByCurrencyMinor', () => {
  it('sums paid order totals per currency, never across currencies', () => {
    const orders = [
      makeOrder({ id: 'a', currency: 'RUB', paymentStatus: 'paid', plants: [{ name: 'Кактус', quantity: 1, unitPriceMinor: 50000 }] }),
      makeOrder({ id: 'b', currency: 'RUB', paymentStatus: 'paid', plants: [{ name: 'Фиалка', quantity: 2, unitPriceMinor: 10000 }] }),
      makeOrder({ id: 'c', currency: 'USD', paymentStatus: 'paid', plants: [{ name: 'Суккулент', quantity: 1, unitPriceMinor: 3000 }] }),
    ]
    const revenue = revenueByCurrencyMinor(orders)
    // RUB: 50000 + 20000; USD kept separate.
    expect(revenue.get('RUB')).toBe(70000)
    expect(revenue.get('USD')).toBe(3000)
    expect(revenue.has('EUR')).toBe(false)
  })

  it('counts ONLY paid orders — pending/refunded/cancelled add nothing', () => {
    const orders = [
      makeOrder({ id: 'a', paymentStatus: 'paid', plants: [{ name: 'Кактус', quantity: 1, unitPriceMinor: 10000 }] }),
      makeOrder({ id: 'b', paymentStatus: 'pending', plants: [{ name: 'Кактус', quantity: 1, unitPriceMinor: 99900 }] }),
      makeOrder({ id: 'c', paymentStatus: 'refunded', plants: [{ name: 'Кактус', quantity: 1, unitPriceMinor: 99900 }] }),
    ]
    expect(revenueByCurrencyMinor(orders).get('RUB')).toBe(10000)
  })

  it('includes delivery in the per-order total', () => {
    const orders = [
      makeOrder({ paymentStatus: 'paid', plants: [{ name: 'Кактус', quantity: 1, unitPriceMinor: 10000 }], deliveryPriceMinor: 5000 }),
    ]
    expect(revenueByCurrencyMinor(orders).get('RUB')).toBe(15000)
  })
})

describe('topPlantsByQuantity', () => {
  it('ranks plants by total quantity across orders, highest first', () => {
    const orders = [
      makeOrder({ id: 'a', plants: [{ name: 'Кактус', quantity: 2, unitPriceMinor: 0 }, { name: 'Фиалка', quantity: 1, unitPriceMinor: 0 }] }),
      makeOrder({ id: 'b', plants: [{ name: 'Кактус', quantity: 3, unitPriceMinor: 0 }, { name: 'Суккулент', quantity: 4, unitPriceMinor: 0 }] }),
    ]
    expect(topPlantsByQuantity(orders, 3)).toEqual([
      { name: 'Кактус', quantity: 5 },
      { name: 'Суккулент', quantity: 4 },
      { name: 'Фиалка', quantity: 1 },
    ])
  })

  it('caps the result at the requested limit', () => {
    const orders = [
      makeOrder({ plants: [
        { name: 'A', quantity: 4, unitPriceMinor: 0 },
        { name: 'B', quantity: 3, unitPriceMinor: 0 },
        { name: 'C', quantity: 2, unitPriceMinor: 0 },
        { name: 'D', quantity: 1, unitPriceMinor: 0 },
      ] }),
    ]
    expect(topPlantsByQuantity(orders, 2).map((p) => p.name)).toEqual(['A', 'B'])
  })

  it('returns an empty array when there are no orders', () => {
    expect(topPlantsByQuantity([], 3)).toEqual([])
  })
})

describe('collectPlantNames', () => {
  it('returns distinct names sorted in ru locale', () => {
    const orders = [
      makeOrder({ id: 'a', plants: [{ name: 'Фиалка', quantity: 1, unitPriceMinor: 0 }, { name: 'Кактус', quantity: 1, unitPriceMinor: 0 }] }),
      makeOrder({ id: 'b', plants: [{ name: 'Суккулент', quantity: 1, unitPriceMinor: 0 }] }),
    ]
    expect(collectPlantNames(orders)).toEqual(['Кактус', 'Суккулент', 'Фиалка'])
  })

  it('dedupes case-insensitively, keeping the first-seen spelling', () => {
    const orders = [
      makeOrder({ id: 'a', plants: [{ name: 'Кактус', quantity: 1, unitPriceMinor: 0 }] }),
      makeOrder({ id: 'b', plants: [{ name: 'кактус', quantity: 1, unitPriceMinor: 0 }] }),
    ]
    // One entry, in the original casing of the first order that used it.
    expect(collectPlantNames(orders)).toEqual(['Кактус'])
  })

  it('trims whitespace and drops blank names', () => {
    const orders = [
      makeOrder({ plants: [
        { name: '  Кактус  ', quantity: 1, unitPriceMinor: 0 },
        { name: '   ', quantity: 1, unitPriceMinor: 0 },
      ] }),
    ]
    expect(collectPlantNames(orders)).toEqual(['Кактус'])
  })

  it('returns an empty array when there are no orders', () => {
    expect(collectPlantNames([])).toEqual([])
  })
})

describe('giftsByDateDesc', () => {
  const gift = (name: string) => ({ name, quantity: 1, unitPriceMinor: 0 })

  it('lists every gift occurrence newest first with its order date, ignoring giftless orders', () => {
    const orders = [
      makeOrder({ id: 'a', dateCreated: 1000, gifts: [gift('Фиалка')] }),
      makeOrder({ id: 'b', dateCreated: 2000 }), // no gifts field at all (pre-gift document)
      makeOrder({ id: 'c', dateCreated: 3000, gifts: [gift('Кактус')] }),
    ]
    expect(giftsByDateDesc(orders)).toEqual([
      { name: 'Кактус', dateCreated: 3000, orderId: 'c' },
      { name: 'Фиалка', dateCreated: 1000, orderId: 'a' },
    ])
  })

  it('keeps repeated gifts as separate occurrences (no dedupe)', () => {
    const orders = [
      makeOrder({ id: 'a', dateCreated: 1000, gifts: [gift('Суккулент')] }),
      makeOrder({ id: 'b', dateCreated: 2000, gifts: [gift('Суккулент')] }),
    ]
    // Both givings survive — the customer page shows each with its own date.
    expect(giftsByDateDesc(orders)).toEqual([
      { name: 'Суккулент', dateCreated: 2000, orderId: 'b' },
      { name: 'Суккулент', dateCreated: 1000, orderId: 'a' },
    ])
  })

  it('drops blank-named entries and returns empty for giftless input', () => {
    expect(giftsByDateDesc([makeOrder({ id: 'a', gifts: [gift('   ')] })])).toEqual([])
    expect(giftsByDateDesc([makeOrder()])).toEqual([])
  })
})
