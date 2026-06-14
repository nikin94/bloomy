// Emulator-backed tests for the orders data layer. Unlike the mock tests
// (orders.test.ts), these run against a real Firestore emulator and so verify
// what mocks cannot: the per-owner number counter under a REAL transaction,
// including atomicity when many orders are created concurrently. Run with
// `yarn test:emulator` (starts the emulator via `firebase emulators:exec`).
import { describe, expect, it } from 'vitest'
import { createOrder, fetchOrder, fetchOrders } from './orders'
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
