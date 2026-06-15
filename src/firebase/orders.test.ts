// Mock-based tests for the orders data layer. The Firebase SDK is replaced with
// vi.fn() stubs, so these verify OUR code in isolation: the per-owner counter
// math, the owner re-check, the query shape, and client-side sorting — fast and
// dependency-free. The real transaction semantics (atomicity under concurrency)
// are exercised separately against the Firestore emulator (orders.emulator.test.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDoc, getDocs, runTransaction, where } from 'firebase/firestore'
import { createOrder, fetchOrder, fetchOrders } from './orders'
import type { NewOrder } from './orders'

vi.mock('./client', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: 'generated-id' })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(() => ({})),
  runTransaction: vi.fn(),
  where: vi.fn(() => ({})),
}))

// A valid stored order document (everything Firestore holds, minus the doc id).
const storedOrder = (overrides: Partial<Record<string, unknown>> = {}) => ({
  number: 1,
  dateCreated: 1000,
  ownerId: 'owner-1',
  customerId: 'customer-1',
  address: 'Main St 1',
  plants: [{ name: 'Rose', quantity: 2, unitPriceMinor: 14990 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 30000,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
  ...overrides,
})

const newOrder: NewOrder = {
  dateCreated: 2000,
  ownerId: 'owner-1',
  customerId: 'customer-1',
  address: 'Main St 1',
  plants: [{ name: 'Rose', quantity: 1, unitPriceMinor: 1000 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createOrder', () => {
  it('issues the next per-owner number and stamps it onto the order', async () => {
    const tx = {
      get: vi.fn().mockResolvedValue({ data: () => ({ lastOrderNumber: 5 }) }),
      set: vi.fn(),
    }
    vi.mocked(runTransaction).mockImplementation(async (_db, fn) => {
      // @ts-expect-error — the fake tx only implements the bits createOrder uses
      await fn(tx)
    })

    const id = await createOrder(newOrder)

    expect(id).toBe('generated-id')
    // Counter bumped 5 -> 6 with a merge write.
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), { lastOrderNumber: 6 }, { merge: true })
    // Order stamped with that number.
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ number: 6 }))
  })

  it('starts numbering at 1 when the owner has no counter yet', async () => {
    const tx = {
      get: vi.fn().mockResolvedValue({ data: () => undefined }),
      set: vi.fn(),
    }
    vi.mocked(runTransaction).mockImplementation(async (_db, fn) => {
      // @ts-expect-error — minimal fake tx
      await fn(tx)
    })

    await createOrder(newOrder)

    expect(tx.set).toHaveBeenCalledWith(expect.anything(), { lastOrderNumber: 1 }, { merge: true })
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ number: 1 }))
  })
})

describe('fetchOrder', () => {
  it('returns the order when the owner matches', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      id: 'o1',
      data: () => storedOrder({ ownerId: 'owner-1' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const order = await fetchOrder('o1', 'owner-1')

    expect(order).not.toBeNull()
    expect(order?.id).toBe('o1')
  })

  it('returns null for an order owned by someone else (defense-in-depth)', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      id: 'o1',
      data: () => storedOrder({ ownerId: 'someone-else' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    expect(await fetchOrder('o1', 'owner-1')).toBeNull()
  })

  it('returns null when the document does not exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any)

    expect(await fetchOrder('missing', 'owner-1')).toBeNull()
  })
})

describe('fetchOrders', () => {
  it('filters by owner and sorts newest-first in memory', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: 'old', data: () => storedOrder({ dateCreated: 1000 }) },
        { id: 'new', data: () => storedOrder({ dateCreated: 3000 }) },
        { id: 'mid', data: () => storedOrder({ dateCreated: 2000 }) },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const orders = await fetchOrders('owner-1')

    expect(where).toHaveBeenCalledWith('ownerId', '==', 'owner-1')
    expect(orders.map((o) => o.id)).toEqual(['new', 'mid', 'old'])
  })
})
