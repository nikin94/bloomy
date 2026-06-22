// Unit tests for the seed builders. The Firestore SDK is stubbed so importing
// the module never initialises the real client; we exercise only the pure,
// deterministic builders and assert every generated document parses through the
// production zod schemas — so a schema change that would break the seeder fails
// here instead of in production.
import { describe, it, expect, vi } from 'vitest'

vi.mock('./client', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: 'generated-id' })),
  getDocs: vi.fn(),
  query: vi.fn(() => ({})),
  setDoc: vi.fn(),
  where: vi.fn(() => ({})),
  writeBatch: vi.fn(),
}))

import { buildSeedCustomers, buildSeedOrders, SEED_ORDER_COUNT } from './seed'
import { STORED_CUSTOMER_SCHEMA } from '../types/customer'
import { STORED_ORDER_SCHEMA } from '../types/order'

const NOW = 1_700_000_000_000

describe('buildSeedCustomers', () => {
  const customers = buildSeedCustomers('owner-1', NOW)

  it('builds owner-scoped customers that parse through the stored schema', () => {
    expect(customers.length).toBeGreaterThanOrEqual(10)
    for (const c of customers) {
      expect(c.ownerId).toBe('owner-1')
      expect(() => STORED_CUSTOMER_SCHEMA.parse(c)).not.toThrow()
    }
  })

  it('includes a couple of soft-deleted customers (for name-resolution coverage)', () => {
    const deleted = customers.filter((c) => c.isDeleted)
    expect(deleted.length).toBe(2)
    // The rest carry no isDeleted flag at all (pristine shape, not `false`).
    expect(customers.filter((c) => 'isDeleted' in c).length).toBe(2)
  })
})

describe('buildSeedOrders', () => {
  const customerIds = ['c0', 'c1', 'c2', 'c3']
  const orders = buildSeedOrders('owner-1', customerIds, NOW)

  it('builds SEED_ORDER_COUNT orders that parse through the stored schema', () => {
    expect(orders.length).toBe(SEED_ORDER_COUNT)
    for (const o of orders) {
      expect(o.ownerId).toBe('owner-1')
      expect(customerIds).toContain(o.customerId)
      expect(() => STORED_ORDER_SCHEMA.parse(o)).not.toThrow()
    }
  })

  it('numbers them sequentially 1..N (oldest first)', () => {
    expect(orders.map((o) => o.number)).toEqual(
      Array.from({ length: SEED_ORDER_COUNT }, (_, i) => i + 1),
    )
    // Oldest order has the lowest number and the earliest dateCreated.
    expect(orders[0].dateCreated).toBeLessThan(orders[orders.length - 1].dateCreated)
  })

  it('covers every shipment and payment status (varied categories)', () => {
    const shipments = new Set(orders.map((o) => o.shipmentStatus))
    const payments = new Set(orders.map((o) => o.paymentStatus))
    expect(shipments).toEqual(new Set(['new', 'packing', 'shipped', 'delivered', 'cancelled']))
    expect(payments).toEqual(new Set(['pending', 'paid', 'refunded']))
  })

  it('puts a slice of orders in the trash so the Корзина page has content', () => {
    expect(orders.filter((o) => o.isDeleted).length).toBeGreaterThan(0)
  })

  it('stamps completedAt exactly on terminal orders, never in the future', () => {
    for (const o of orders) {
      const terminal = o.shipmentStatus === 'delivered' || o.shipmentStatus === 'cancelled'
      expect('completedAt' in o).toBe(terminal)
      if (o.completedAt !== undefined) expect(o.completedAt).toBeLessThanOrEqual(NOW)
    }
  })

  it('throws when given no customers to link', () => {
    expect(() => buildSeedOrders('owner-1', [], NOW)).toThrow()
  })
})
