// Mock-based tests for the orders data layer. The Firebase SDK is replaced with
// vi.fn() stubs, so these verify OUR code in isolation: the per-owner counter
// math, the owner re-check, the query shape, and client-side sorting — fast and
// dependency-free. The real transaction semantics (atomicity under concurrency)
// are exercised separately against the Firestore emulator (orders.emulator.test.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteField,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import {
  createOrder,
  fetchDeletedOrders,
  fetchOrder,
  fetchOrders,
  patchOrder,
  reconcileOrderNumbers,
  restoreOrder,
  softDeleteOrder,
  updateOrder,
} from './orders'
import type { NewOrder } from './orders'
import type { Order } from '../types/order'

vi.mock('./client', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  deleteField: vi.fn(() => ({ __deleted: true })),
  doc: vi.fn(() => ({ id: 'generated-id' })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(() => ({})),
  runTransaction: vi.fn(),
  setDoc: vi.fn(),
  // Timestamp.fromMillis is a pure client value; stub it to a tagged object so a
  // test can assert the purge timestamp without pulling in the real SDK.
  Timestamp: { fromMillis: vi.fn((ms: number) => ({ __ts: ms })) },
  updateDoc: vi.fn(),
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
  // Every mutation fire-and-forgets its write and attaches a `.catch`, so the
  // mocked writes must return a promise (setDoc for create, updateDoc for the
  // rest — updateOrder/patchOrder/softDeleteOrder/restoreOrder).
  vi.mocked(setDoc).mockResolvedValue(undefined)
  vi.mocked(updateDoc).mockResolvedValue(undefined)
})

describe('createOrder', () => {
  it('writes the order with number=null and returns the id synchronously, with no transaction', () => {
    // Returns the generated doc id at once (offline-safe: no await on the write).
    const id = createOrder(newOrder)
    expect(id).toBe('generated-id')

    // The order is stored unnumbered; reconcileOrderNumbers assigns the real
    // number later. No counter transaction runs at create time.
    expect(setDoc).toHaveBeenCalledTimes(1)
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { ...newOrder, number: null })
    expect(runTransaction).not.toHaveBeenCalled()
  })
})

describe('reconcileOrderNumbers', () => {
  // Build a getDocs snapshot of order docs (id + data) for the owner query.
  const snapshotOf = (docs: { id: string; data: Record<string, unknown> }[]) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }) as any

  // Fake the counter transaction: within each tx, the first get() is the order
  // (always unnumbered here) and the second is the owner counter; the counter
  // persists across transactions, so successive orders get 1, 2, 3…
  const fakeCounterTransactions = (records: number[]) => {
    let counter = 0
    vi.mocked(runTransaction).mockImplementation(async (_db, fn) => {
      let getCall = 0
      const tx = {
        get: vi.fn(async () => {
          getCall += 1
          return getCall === 1
            ? { exists: () => true, data: () => ({ number: null }) }
            : { data: () => ({ lastOrderNumber: counter }) }
        }),
        set: vi.fn((_ref: unknown, data: { lastOrderNumber?: number }) => {
          if (typeof data?.lastOrderNumber === 'number') counter = data.lastOrderNumber
        }),
        update: vi.fn((_ref: unknown, data: { number: number }) => records.push(data.number)),
      }
      // @ts-expect-error — minimal fake tx
      return fn(tx)
    })
  }

  it('numbers only the unnumbered orders, oldest first, with a serial counter', async () => {
    vi.mocked(getDocs).mockResolvedValue(
      snapshotOf([
        { id: 'b', data: storedOrder({ number: null, dateCreated: 2000 }) },
        { id: 'a', data: storedOrder({ number: null, dateCreated: 1000 }) },
        { id: 'c', data: storedOrder({ number: 3, dateCreated: 3000 }) }, // already numbered — skipped
      ]),
    )
    const assigned: number[] = []
    fakeCounterTransactions(assigned)

    const numbered = await reconcileOrderNumbers('owner-1')

    expect(numbered).toBe(true)
    // Two transactions (one per unnumbered order), assigning 1 then 2 — the
    // already-numbered 'c' is filtered out and never enters a transaction.
    expect(runTransaction).toHaveBeenCalledTimes(2)
    expect(assigned).toEqual([1, 2])
  })

  it('returns false and runs no transaction when every order is already numbered', async () => {
    vi.mocked(getDocs).mockResolvedValue(snapshotOf([{ id: 'a', data: storedOrder({ number: 1 }) }]))

    const numbered = await reconcileOrderNumbers('owner-1')

    expect(numbered).toBe(false)
    expect(runTransaction).not.toHaveBeenCalled()
  })
})

describe('updateOrder', () => {
  it('writes the supplied fields with updateDoc (per-field merge) and removes cleared optionals', async () => {
    // No comment / completedAt on the body → they must be deleteField()'d so a
    // field the user cleared is actually removed, not left lingering by the merge.
    const body = storedOrder({ number: 7, paymentStatus: 'paid' }) as Omit<Order, 'id'>

    await updateOrder('o1', body)

    // A per-field merge (updateDoc, not a wholesale setDoc) — and the absent
    // optionals are removed via the deleteField sentinel.
    expect(updateDoc).toHaveBeenCalledTimes(1)
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      ...body,
      comment: { __deleted: true },
      completedAt: { __deleted: true },
    })
    expect(setDoc).not.toHaveBeenCalled()
    // No numbering transaction on edit.
    expect(runTransaction).not.toHaveBeenCalled()
  })

  it('keeps present optional fields instead of deleting them', async () => {
    const body = storedOrder({ comment: 'note', completedAt: 1700 }) as Omit<Order, 'id'>

    await updateOrder('o1', body)

    const written = vi.mocked(updateDoc).mock.calls[0][1] as unknown as Record<string, unknown>
    expect(written.comment).toBe('note')
    expect(written.completedAt).toBe(1700)
  })
})

describe('patchOrder', () => {
  it('writes only the given field (partial merge), with no wholesale replace', async () => {
    await patchOrder('o1', { paymentStatus: 'paid' })

    expect(updateDoc).toHaveBeenCalledTimes(1)
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { paymentStatus: 'paid' })
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('removes the completion stamp when completedAt is null', async () => {
    await patchOrder('o1', { shipmentStatus: 'new', completedAt: null })

    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      shipmentStatus: 'new',
      completedAt: { __deleted: true },
    })
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

  it('returns null for a soft-deleted order (treated as gone)', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      id: 'o1',
      data: () => storedOrder({ ownerId: 'owner-1', isDeleted: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    expect(await fetchOrder('o1', 'owner-1')).toBeNull()
  })

  it('treats a deletedAt-stamped order as gone by default, but returns it with includeDeleted', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      id: 'o1',
      data: () => storedOrder({ ownerId: 'owner-1', deletedAt: 1700 }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    // Default: a trashed order is gone (a stale link dead-ends).
    expect(await fetchOrder('o1', 'owner-1')).toBeNull()
    // includeDeleted: the trash detail view opens it read-only instead.
    const viewed = await fetchOrder('o1', 'owner-1', { includeDeleted: true })
    expect(viewed?.id).toBe('o1')
    expect(viewed?.deletedAt).toBe(1700)
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

  it('drops soft-deleted orders from the list (both legacy isDeleted and deletedAt)', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: 'live', data: () => storedOrder({ dateCreated: 2000 }) },
        { id: 'legacy-gone', data: () => storedOrder({ dateCreated: 3000, isDeleted: true }) },
        { id: 'gone', data: () => storedOrder({ dateCreated: 4000, deletedAt: 4000 }) },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const orders = await fetchOrders('owner-1')

    expect(orders.map((o) => o.id)).toEqual(['live'])
  })
})

describe('fetchDeletedOrders', () => {
  it('keeps only soft-deleted orders, newest-first (complement of the live list)', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: 'live', data: () => storedOrder({ dateCreated: 1000 }) },
        { id: 'gone-old', data: () => storedOrder({ dateCreated: 2000, isDeleted: true }) },
        { id: 'gone-new', data: () => storedOrder({ dateCreated: 3000, isDeleted: true }) },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const orders = await fetchDeletedOrders('owner-1')

    expect(where).toHaveBeenCalledWith('ownerId', '==', 'owner-1')
    expect(orders.map((o) => o.id)).toEqual(['gone-new', 'gone-old'])
  })
})

describe('restoreOrder', () => {
  it('clears every trash field (new deletedAt/purgeAt + legacy isDeleted) via a partial update', async () => {
    vi.mocked(doc).mockReturnValue({ ref: 'order-ref' } as never)

    await restoreOrder('o1')

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'orders', 'o1')
    // deleteField() removes the trash fields so the order returns to its pristine,
    // never-deleted shape; the legacy isDeleted is cleared too so an order trashed
    // before the switch restores cleanly.
    expect(deleteField).toHaveBeenCalled()
    expect(updateDoc).toHaveBeenCalledWith(
      { ref: 'order-ref' },
      {
        deletedAt: { __deleted: true },
        purgeAt: { __deleted: true },
        isDeleted: { __deleted: true },
      },
    )
    expect(setDoc).not.toHaveBeenCalled()
  })
})

describe('softDeleteOrder', () => {
  it('stamps deletedAt + a purgeAt timestamp (retention window) without removing the document', async () => {
    vi.mocked(doc).mockReturnValue({ ref: 'order-ref' } as never)

    await softDeleteOrder('o1')

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'orders', 'o1')
    // A partial update (not setDoc) — every other field stays intact.
    expect(setDoc).not.toHaveBeenCalled()
    const [, writes] = vi.mocked(updateDoc).mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ]
    // deletedAt is "now" (ms); purgeAt is exactly 30 days later, as a Timestamp.
    expect(typeof writes.deletedAt).toBe('number')
    const deletedAt = writes.deletedAt as number
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
    expect(writes.purgeAt).toEqual({ __ts: deletedAt + THIRTY_DAYS })
    expect(writes).not.toHaveProperty('isDeleted')
  })
})
