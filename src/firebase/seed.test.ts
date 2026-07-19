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
  Timestamp: { fromMillis: vi.fn((ms: number) => ({ __ts: ms })) },
}))

import { writeBatch, getDocs, setDoc } from 'firebase/firestore'
import { buildSeedCustomers, buildSeedOrders, seedMockData, wipeOwnerData, SEED_ORDER_COUNT } from './seed'
import { STORED_CUSTOMER_SCHEMA } from '@/types/customer'
import { STORED_ORDER_SCHEMA, CURRENCIES } from '@/types/order'

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

  it('covers every order and payment status (varied categories)', () => {
    const statuses = new Set(orders.map((o) => o.status))
    const payments = new Set(orders.map((o) => o.paymentStatus))
    expect(statuses).toEqual(new Set(['processing', 'delivered', 'cancelled']))
    expect(payments).toEqual(new Set(['pending', 'paid', 'refunded']))
  })

  it('puts a slice of orders in the trash (deletedAt) so the Корзина page has content', () => {
    const trashed = orders.filter((o) => o.deletedAt !== undefined)
    expect(trashed.length).toBeGreaterThan(0)
    // Stamped within the retention window so each shows a live purge countdown.
    expect(trashed.every((o) => o.deletedAt! <= NOW)).toBe(true)
  })

  it('spreads orders across all supported currencies, in both the active list and the trash', () => {
    // The multi-currency UI (per-currency revenue cards, currency-scoped price
    // filter) needs more than RUB to exercise. The currency modulo is offset from
    // the trash modulo so USD/EUR land in BOTH slices, not only the active one.
    expect(new Set(orders.map((o) => o.currency))).toEqual(new Set(CURRENCIES))
    const trashedCurrencies = new Set(
      orders.filter((o) => o.deletedAt !== undefined).map((o) => o.currency),
    )
    expect(trashedCurrencies.size).toBeGreaterThan(1)
  })

  it('stamps completedAt exactly on terminal orders, never in the future', () => {
    for (const o of orders) {
      const terminal = o.status === 'delivered' || o.status === 'cancelled'
      expect('completedAt' in o).toBe(terminal)
      if (o.completedAt !== undefined) expect(o.completedAt).toBeLessThanOrEqual(NOW)
    }
  })

  it('throws when given no customers to link', () => {
    expect(() => buildSeedOrders('owner-1', [], NOW)).toThrow()
  })
})

describe('seedMockData', () => {
  it('writes no purge timestamp and reports the trashed count by deletedAt', async () => {
    // Capture every payload the write batch receives, so we inspect the exact
    // documents seedMockData writes to Firestore (not just the builder output).
    const writes: Record<string, unknown>[] = []
    const batch = {
      set: (_ref: unknown, data: Record<string, unknown>) => writes.push(data),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>)

    const result = await seedMockData('owner-1', { reset: false }, NOW)

    // The admin UI's "trashed" line reads this count; it must reflect the real
    // trash (deletedAt), not the always-0 legacy `isDeleted` count.
    expect(result.trashed).toBeGreaterThan(0)

    // Isolate the ORDER payloads (customer payloads have no status).
    const orders = writes.filter((d) => 'status' in d)
    const trashed = orders.filter((d) => d.deletedAt !== undefined)
    const active = orders.filter((d) => d.deletedAt === undefined)

    expect(trashed.length).toBe(result.trashed)
    // The auto-purge is gone: NO seeded document carries the retired purgeAt —
    // seeded trash sits in the trash indefinitely, like real trash.
    expect(orders.some((d) => 'purgeAt' in d)).toBe(false)
    expect(active.length + trashed.length).toBe(orders.length)
  })
})

describe('wipeOwnerData', () => {
  it('batch-deletes every owner order and customer and resets the number counter', async () => {
    // getDocs is called once per collection (orders, then customers); return a
    // distinct doc set for each so the counts can be told apart in the result.
    const orderDocs = [{ ref: 'o1' }, { ref: 'o2' }, { ref: 'o3' }]
    const customerDocs = [{ ref: 'c1' }, { ref: 'c2' }]
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: orderDocs, size: orderDocs.length } as never)
      .mockResolvedValueOnce({ docs: customerDocs, size: customerDocs.length } as never)
    const deleted: unknown[] = []
    const batch = {
      set: vi.fn(),
      delete: (ref: unknown) => deleted.push(ref),
      commit: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>)

    const result = await wipeOwnerData('owner-1')

    // Every doc of both collections is deleted, and the reported counts match
    // what the admin UI prints.
    expect(deleted).toEqual(['o1', 'o2', 'o3', 'c1', 'c2'])
    expect(result).toEqual({ removedOrders: 3, removedCustomers: 2 })
    // The per-owner counter is reset so the next real order starts at №1.
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { lastOrderNumber: 0 })
  })
})
