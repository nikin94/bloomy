// Emulator-backed test for the seeder's full write path — what the mock builder
// tests can't cover: that reset hard-deletes the owner's prior data, the fixtures
// land owner-scoped and readable through the normal data layer (active list,
// trash, address book), and the number counter is left ahead of the seeded
// numbers so the next real order continues the sequence. Run with
// `yarn test:emulator`.
import { describe, expect, it } from 'vitest'
import { waitForPendingWrites } from 'firebase/firestore'
import { db } from './client'
import { seedMockData, SEED_ORDER_COUNT } from './seed'
import { createOrder, fetchDeletedOrders, fetchOrder, fetchOrders, reconcileOrderNumbers } from './orders'
import { fetchCustomers } from './customers'

const NOW = 1_700_000_000_000

describe('seedMockData (emulator)', () => {
  it('seeds an owner with active orders, a trash, an address book, and a primed counter', async () => {
    const owner = 'owner-seed-fresh'
    const result = await seedMockData(owner, { reset: false }, NOW)

    const active = await fetchOrders(owner)
    const trashed = await fetchDeletedOrders(owner)
    const customers = await fetchCustomers(owner) // active only

    // Active + trashed accounts for every seeded order; the trash is non-empty.
    expect(active.length + trashed.length).toBe(SEED_ORDER_COUNT)
    expect(trashed.length).toBe(result.trashed)
    expect(trashed.length).toBeGreaterThan(0)
    // Soft-deleted customers are excluded from the default address-book read.
    expect(customers.length).toBe(result.customers - 2)

    // The counter is primed: the next real order continues after the seeded run.
    const id = createOrder({
      dateCreated: NOW,
      ownerId: owner,
      customerId: customers[0].id,
      address: 'ул. Новая, 1',
      plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 100000 }],
      paymentMethod: 'cash',
      deliveryMethod: 'post',
      deliveryPriceMinor: 0,
      currency: 'RUB',
      paymentStatus: 'pending',
      shipmentStatus: 'new',
    })
    await waitForPendingWrites(db)
    await reconcileOrderNumbers(owner)
    expect((await fetchOrder(id, owner))?.number).toBe(SEED_ORDER_COUNT + 1)
  })

  it('reset wipes the prior seed instead of doubling it', async () => {
    const owner = 'owner-seed-reset'
    await seedMockData(owner, { reset: false }, NOW)
    const second = await seedMockData(owner, { reset: true }, NOW)

    // The second run removed the first run's docs, so totals stay at one seed.
    expect(second.removedOrders).toBe(SEED_ORDER_COUNT)
    const active = await fetchOrders(owner)
    const trashed = await fetchDeletedOrders(owner)
    expect(active.length + trashed.length).toBe(SEED_ORDER_COUNT)
  })
})
