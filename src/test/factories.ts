import type { Customer } from '@/types/customer'
import type { Order } from '@/types/order'

// Shared test-fixture factories for Order and Customer, so the many *.test files
// stop each re-declaring a near-identical local `order()`/`customer()`. Every
// factory returns a fully-valid object with canonical defaults; pass a partial
// `over` to change only the fields a test cares about.
//
// These canonical defaults were chosen to match the most common local shape that
// existed before consolidation. Files whose old defaults differed keep a thin
// local wrapper that applies those file-specific defaults on top, so no test sees
// a different observable fixture value than it did before.
//
// NOTE: this is deliberately NOT the same shape as `src/test/firestore.rules.test.ts`,
// which builds a raw Firestore doc keyed by an `ownerId` argument — that is a
// different concern and keeps its own local factories.

export const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  number: 1,
  dateCreated: 0,
  ownerId: 'owner-1',
  customerId: 'c1',
  address: '',
  plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 100000 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
  ...over,
})

export const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  ownerId: 'owner-1',
  name: 'Анна',
  createdAt: 0,
  ...over,
})
