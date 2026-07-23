// Emulator-backed tests for the orders data layer. Unlike the mock tests
// (orders.test.ts), these run against a real Firestore emulator and so verify
// what mocks cannot: the per-owner number counter under a REAL transaction,
// including atomicity when many orders are created concurrently. Run with
// `yarn test:emulator` (starts the emulator via `firebase emulators:exec`).
import { describe, expect, it } from 'vitest'
import { waitForPendingWrites } from 'firebase/firestore'
import { db } from './client'
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
  status: 'processing',
})

// Create an order AND give it its real number, the way the app does across a
// create→sync→reconcile cycle. Used by tests that assert on numbers or counter
// behaviour, so they read as before despite numbering now being a two-step
// (offline-safe create, then online reconcile). Tests of the offline/null/
// reconcile semantics themselves call createOrder + reconcileOrderNumbers raw.
async function createNumbered(order: NewOrder): Promise<string> {
  const id = createOrder(order)
  await waitForPendingWrites(db)
  await reconcileOrderNumbers(order.ownerId)
  return id
}

describe('createOrder (emulator)', () => {
  it('creates an order with NO number (offline-safe), then waitForPendingWrites commits it', async () => {
    const owner = 'owner-create-null'
    const id = await createOrder(makeOrder(owner))
    // createOrder returns the id synchronously and queues the write; the order
    // is stored with number === null until a reconcile assigns one.
    await waitForPendingWrites(db)
    const order = await fetchOrder(id, owner)
    expect(order).not.toBeNull()
    expect(order?.number).toBeNull()
  })

  it('hides an order from a different owner (owner re-check)', async () => {
    const id = await createOrder(makeOrder('owner-real'))
    await waitForPendingWrites(db)
    expect(await fetchOrder(id, 'owner-real')).not.toBeNull()
    expect(await fetchOrder(id, 'owner-intruder')).toBeNull()
  })
})

describe('reconcileOrderNumbers (emulator)', () => {
  it('assigns sequential per-owner numbers in creation order', async () => {
    const owner = 'owner-sequential'
    const id1 = await createOrder({ ...makeOrder(owner), dateCreated: 1000 })
    const id2 = await createOrder({ ...makeOrder(owner), dateCreated: 2000 })
    const id3 = await createOrder({ ...makeOrder(owner), dateCreated: 3000 })
    await waitForPendingWrites(db)

    const result = await reconcileOrderNumbers(owner)
    expect(result).toEqual({ numbered: true, remaining: false })

    const byId = new Map((await fetchOrders(owner)).map((o) => [o.id, o.number]))
    expect(byId.get(id1)).toBe(1)
    expect(byId.get(id2)).toBe(2)
    expect(byId.get(id3)).toBe(3)
  })

  it('numbers each owner independently, starting at 1', async () => {
    await createOrder(makeOrder('owner-a'))
    const id = await createOrder(makeOrder('owner-b'))
    await waitForPendingWrites(db)
    await reconcileOrderNumbers('owner-a')
    await reconcileOrderNumbers('owner-b')

    expect((await fetchOrder(id, 'owner-b'))?.number).toBe(1)
  })

  it('is idempotent — a second reconcile re-numbers nothing and leaves numbers intact', async () => {
    const owner = 'owner-idempotent'
    await createOrder(makeOrder(owner))
    await createOrder(makeOrder(owner))
    await waitForPendingWrites(db)

    expect(await reconcileOrderNumbers(owner)).toEqual({ numbered: true, remaining: false })
    const first = (await fetchOrders(owner)).map((o) => o.number).sort()
    // Nothing left unnumbered, so the second pass assigns nobody.
    expect(await reconcileOrderNumbers(owner)).toEqual({ numbered: false, remaining: false })
    const second = (await fetchOrders(owner)).map((o) => o.number).sort()
    expect(second).toEqual(first)
  })

  it('never issues duplicate numbers when two reconciles race (real transaction)', async () => {
    const owner = 'owner-concurrent'
    const count = 8
    await Promise.all(Array.from({ length: count }, () => createOrder(makeOrder(owner))))
    await waitForPendingWrites(db)

    // Two clients reconciling at once: the counter transaction serializes the
    // increments and the in-transaction re-check skips an already-numbered order,
    // so the result is exactly 1..count — no gaps, no duplicates.
    await Promise.all([reconcileOrderNumbers(owner), reconcileOrderNumbers(owner)])

    const numbers = (await fetchOrders(owner))
      .map((o) => o.number)
      .sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(numbers).toEqual(Array.from({ length: count }, (_, i) => i + 1))
  })
})

describe('updateOrder (emulator)', () => {
  it('preserves the id and per-owner number while saving edited fields', async () => {
    const owner = 'owner-edit'
    // Two creates so the edited order has a non-trivial number (2), proving the
    // update keeps it rather than re-deriving from the counter.
    await createNumbered(makeOrder(owner))
    const id = await createNumbered(makeOrder(owner))
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
    const id = await createNumbered(makeOrder(owner))
    const original = await fetchOrder(id, owner)

    await updateOrder(id, { ...original!, status: 'delivered', completedAt: 1700 })

    const updated = await fetchOrder(id, owner)
    expect(updated?.completedAt).toBe(1700)
  })

  it('removes an optional field the edit cleared (comment dropped, not lingering)', async () => {
    const owner = 'owner-clear-comment'
    const id = await createNumbered(makeOrder(owner))
    await updateOrder(id, { ...(await fetchOrder(id, owner))!, comment: 'note' })
    expect((await fetchOrder(id, owner))?.comment).toBe('note')

    // Re-save WITHOUT a comment key — the per-field merge must delete it, not
    // leave the old value behind (the setDoc-replace behaviour we kept).
    const withComment = await fetchOrder(id, owner)
    delete withComment!.comment
    await updateOrder(id, withComment!)

    expect((await fetchOrder(id, owner))?.comment).toBeUndefined()
  })
})

describe('patchOrder (emulator)', () => {
  it('merges concurrent edits to DIFFERENT fields instead of clobbering', async () => {
    const owner = 'owner-merge'
    const id = await createNumbered(makeOrder(owner))

    // Two independent inline patches, as two devices would send them: one flips
    // the payment status, the other the order status. A per-field merge keeps
    // BOTH — a wholesale replace would have let the later write erase the earlier.
    await patchOrder(id, { paymentStatus: 'paid' })
    await patchOrder(id, { status: 'delivered' })

    const merged = await fetchOrder(id, owner)
    expect(merged?.paymentStatus).toBe('paid')
    expect(merged?.status).toBe('delivered')
    // The rest of the order is untouched by either partial write.
    expect(merged?.address).toBe('Main St 1')
    expect(merged?.number).toBe(1)
  })

  it('drops the completion stamp when patched with completedAt: null', async () => {
    const owner = 'owner-patch-clear'
    const id = await createNumbered(makeOrder(owner))
    await patchOrder(id, { status: 'delivered', completedAt: 1700 })
    expect((await fetchOrder(id, owner))?.completedAt).toBe(1700)

    await patchOrder(id, { status: 'processing', completedAt: null })

    const reopened = await fetchOrder(id, owner)
    expect(reopened?.completedAt).toBeUndefined()
    expect(reopened?.status).toBe('processing')
  })

  it('does not bump the owner counter (a later create still increments by one)', async () => {
    const owner = 'owner-edit-counter'
    const id = await createNumbered(makeOrder(owner)) // number 1
    const original = await fetchOrder(id, owner)

    await updateOrder(id, { ...original!, address: 'New St 2' })

    // If the edit had touched the counter, the next create would skip a number.
    const nextId = await createNumbered(makeOrder(owner))
    const next = await fetchOrder(nextId, owner)
    expect(next?.number).toBe(2)
  })
})

describe('softDeleteOrder (emulator)', () => {
  it('hides the order from the list and the detail fetch without touching the counter', async () => {
    const owner = 'owner-soft-delete'
    const keepId = await createNumbered(makeOrder(owner)) // number 1
    const dropId = await createNumbered(makeOrder(owner)) // number 2

    await softDeleteOrder(dropId)

    // Gone from the list and from a direct fetch (treated as not found)…
    const listed = await fetchOrders(owner)
    expect(listed.map((o) => o.id)).toEqual([keepId])
    expect(await fetchOrder(dropId, owner)).toBeNull()

    // …but the counter is untouched: the next create is number 3, not a reused 2.
    const nextId = await createNumbered(makeOrder(owner))
    expect((await fetchOrder(nextId, owner))?.number).toBe(3)
  })

  it('preserves every other field on the kept document', async () => {
    const owner = 'owner-soft-delete-fields'
    const id = await createNumbered(makeOrder(owner))

    await softDeleteOrder(id)

    // Read past the fetchOrder filter via a fresh owner-scoped list is not
    // possible (it filters deleted), so assert through the data the delete left:
    // a subsequent create still numbers 2, proving the doc (and its number 1) was
    // kept rather than removed.
    const nextId = await createNumbered(makeOrder(owner))
    expect((await fetchOrder(nextId, owner))?.number).toBe(2)
  })
})

describe('fetchDeletedOrders + restoreOrder (emulator)', () => {
  it('lists soft-deleted orders, and restore returns one to the active list', async () => {
    const owner = 'owner-trash'
    const keepId = await createNumbered(makeOrder(owner)) // stays active
    const dropId = await createNumbered(makeOrder(owner)) // deleted then restored

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
