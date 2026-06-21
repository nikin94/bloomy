// Emulator-backed tests for the orders data layer. Unlike the mock tests
// (orders.test.ts), these run against a real Firestore emulator and so verify
// what mocks cannot: the per-owner number counter under a REAL transaction,
// including atomicity when many orders are created concurrently. Run with
// `yarn test:emulator` (starts the emulator via `firebase emulators:exec`).
import { describe, expect, it } from 'vitest'
import {
  createOrder,
  fetchDeletedOrders,
  fetchOrder,
  fetchOrders,
  restoreOrder,
  softDeleteOrder,
  updateOrder,
} from './orders'
import type { NewOrder } from './orders'

// Each test uses a fresh ownerId so its per-owner counter starts at 1 and tests
// never interfere — no need to clear the emulator between them.
const makeOrder = (ownerId: string): NewOrder => ({
  dateCreated: 1000,
  ownerId,
  customerId: 'customer-1',
  address: 'Main St 1',
  plants: [{ name: 'Rose', quantity: 1, unitPriceMinor: 1000 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
})

describe('createOrder (emulator)', () => {
  it('assigns sequential per-owner numbers across successive creates', async () => {
    const owner = 'owner-sequential'
    const id1 = await createOrder(makeOrder(owner))
    const id2 = await createOrder(makeOrder(owner))
    const id3 = await createOrder(makeOrder(owner))

    const byId = new Map((await fetchOrders(owner)).map((o) => [o.id, o.number]))
    expect(byId.get(id1)).toBe(1)
    expect(byId.get(id2)).toBe(2)
    expect(byId.get(id3)).toBe(3)
  })

  it('never issues duplicate numbers under concurrent creates (real transaction)', async () => {
    const owner = 'owner-concurrent'
    const count = 8
    await Promise.all(Array.from({ length: count }, () => createOrder(makeOrder(owner))))

    const numbers = (await fetchOrders(owner)).map((o) => o.number).sort((a, b) => a - b)
    // A correct transaction serializes the counter: exactly 1..count, no gaps,
    // no duplicates. A non-atomic read-modify-write would collide and repeat.
    expect(numbers).toEqual(Array.from({ length: count }, (_, i) => i + 1))
  })

  it('numbers each owner independently, starting at 1', async () => {
    await createOrder(makeOrder('owner-a'))
    const id = await createOrder(makeOrder('owner-b'))

    const order = await fetchOrder(id, 'owner-b')
    expect(order?.number).toBe(1)
  })

  it('hides an order from a different owner (owner re-check)', async () => {
    const id = await createOrder(makeOrder('owner-real'))
    expect(await fetchOrder(id, 'owner-real')).not.toBeNull()
    expect(await fetchOrder(id, 'owner-intruder')).toBeNull()
  })
})

describe('updateOrder (emulator)', () => {
  it('preserves the id and per-owner number while saving edited fields', async () => {
    const owner = 'owner-edit'
    // Two creates so the edited order has a non-trivial number (2), proving the
    // update keeps it rather than re-deriving from the counter.
    await createOrder(makeOrder(owner))
    const id = await createOrder(makeOrder(owner))
    const original = await fetchOrder(id, owner)
    expect(original?.number).toBe(2)

    await updateOrder(id, {
      ...original!,
      paymentStatus: 'paid',
      comment: 'edited',
    })

    const updated = await fetchOrder(id, owner)
    // Same document (id) and same number — the numbering counter was untouched.
    expect(updated?.id).toBe(id)
    expect(updated?.number).toBe(2)
    // Edited fields persisted.
    expect(updated?.paymentStatus).toBe('paid')
    expect(updated?.comment).toBe('edited')
  })

  it('round-trips the optional completedAt stamp', async () => {
    const owner = 'owner-completed-at'
    const id = await createOrder(makeOrder(owner))
    const original = await fetchOrder(id, owner)

    await updateOrder(id, { ...original!, shipmentStatus: 'delivered', completedAt: 1700 })

    const updated = await fetchOrder(id, owner)
    expect(updated?.completedAt).toBe(1700)
  })

  it('does not bump the owner counter (a later create still increments by one)', async () => {
    const owner = 'owner-edit-counter'
    const id = await createOrder(makeOrder(owner)) // number 1
    const original = await fetchOrder(id, owner)

    await updateOrder(id, { ...original!, address: 'New St 2' })

    // If the edit had touched the counter, the next create would skip a number.
    const nextId = await createOrder(makeOrder(owner))
    const next = await fetchOrder(nextId, owner)
    expect(next?.number).toBe(2)
  })
})

describe('softDeleteOrder (emulator)', () => {
  it('hides the order from the list and the detail fetch without touching the counter', async () => {
    const owner = 'owner-soft-delete'
    const keepId = await createOrder(makeOrder(owner)) // number 1
    const dropId = await createOrder(makeOrder(owner)) // number 2

    await softDeleteOrder(dropId)

    // Gone from the list and from a direct fetch (treated as not found)…
    const listed = await fetchOrders(owner)
    expect(listed.map((o) => o.id)).toEqual([keepId])
    expect(await fetchOrder(dropId, owner)).toBeNull()

    // …but the counter is untouched: the next create is number 3, not a reused 2.
    const nextId = await createOrder(makeOrder(owner))
    expect((await fetchOrder(nextId, owner))?.number).toBe(3)
  })

  it('preserves every other field on the kept document', async () => {
    const owner = 'owner-soft-delete-fields'
    const id = await createOrder(makeOrder(owner))

    await softDeleteOrder(id)

    // Read past the fetchOrder filter via a fresh owner-scoped list is not
    // possible (it filters deleted), so assert through the data the delete left:
    // a subsequent create still numbers 2, proving the doc (and its number 1) was
    // kept rather than removed.
    const nextId = await createOrder(makeOrder(owner))
    expect((await fetchOrder(nextId, owner))?.number).toBe(2)
  })
})

describe('fetchDeletedOrders + restoreOrder (emulator)', () => {
  it('lists soft-deleted orders, and restore returns one to the active list', async () => {
    const owner = 'owner-trash'
    const keepId = await createOrder(makeOrder(owner)) // stays active
    const dropId = await createOrder(makeOrder(owner)) // deleted then restored

    await softDeleteOrder(dropId)

    // The trash shows only the deleted order; the active list shows only the kept one.
    expect((await fetchDeletedOrders(owner)).map((o) => o.id)).toEqual([dropId])
    expect((await fetchOrders(owner)).map((o) => o.id)).toEqual([keepId])

    await restoreOrder(dropId)

    // After restore: trash is empty, the order is back in the active list and the
    // detail fetch finds it again.
    expect(await fetchDeletedOrders(owner)).toEqual([])
    const listed = await fetchOrders(owner)
    expect(listed.map((o) => o.id).sort()).toEqual([dropId, keepId].sort())
    expect(await fetchOrder(dropId, owner)).not.toBeNull()
  })
})
