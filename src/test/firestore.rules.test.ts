// Security-rules tests for firestore.rules, run against the Firestore emulator
// via @firebase/rules-unit-testing. These verify the SERVER-SIDE boundary that
// the app relies on for multi-tenancy: a signed-in user may only read/write
// documents scoped to their own uid. Run with `yarn test:rules`.
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
// The rules under test, loaded as a raw string via Vite's `?raw` import so the
// test feeds the exact same file that ships to production.
import rulesSource from '../../firestore.rules?raw'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let testEnv: RulesTestEnvironment

// Firestore instances: each carries an auth identity (or none) and enforces the
// rules. `alice`/`bob` are two distinct tenants; `anon` is signed out.
const alice = () => testEnv.authenticatedContext('alice').firestore()
const bob = () => testEnv.authenticatedContext('bob').firestore()
const anon = () => testEnv.unauthenticatedContext().firestore()

const order = (ownerId: string) => ({
  number: 1,
  dateCreated: 1000,
  ownerId,
  customerId: 'c1',
  address: 'Main St 1',
  plants: [{ name: 'Rose', quantity: 1, unitPriceMinor: 1000 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
})

const customer = (ownerId: string) => ({ ownerId, name: 'Иван', createdAt: 1000 })

// Seed a document bypassing rules, so read/update/delete tests start from an
// existing doc owned by a specific tenant.
const seed = (path: string, data: object) =>
  testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bloomy',
    firestore: { rules: rulesSource, host: '127.0.0.1', port: 8080 },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

describe('orders rules', () => {
  it('lets a user create an order under their own uid', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'orders/o1'), order('alice')))
  })

  it('forbids creating an order under another uid', async () => {
    await assertFails(setDoc(doc(alice(), 'orders/o1'), order('bob')))
  })

  it('forbids an unauthenticated create', async () => {
    await assertFails(setDoc(doc(anon(), 'orders/o1'), order('alice')))
  })

  it('lets the owner read their order but hides it from others', async () => {
    await seed('orders/o1', order('alice'))
    await assertSucceeds(getDoc(doc(alice(), 'orders/o1')))
    await assertFails(getDoc(doc(bob(), 'orders/o1')))
    await assertFails(getDoc(doc(anon(), 'orders/o1')))
  })

  it('lets the owner delete their order but not a foreign one', async () => {
    await seed('orders/o1', order('alice'))
    await assertFails(deleteDoc(doc(bob(), 'orders/o1')))
    await assertSucceeds(deleteDoc(doc(alice(), 'orders/o1')))
  })

  it('forbids reassigning an order to another owner on update', async () => {
    await seed('orders/o1', order('alice'))
    await assertSucceeds(updateDoc(doc(alice(), 'orders/o1'), { address: 'New St 2' }))
    await assertFails(updateDoc(doc(alice(), 'orders/o1'), { ownerId: 'bob' }))
  })

  it('allows an owner-scoped list query but rejects reading another tenant', async () => {
    await seed('orders/o1', order('alice'))
    await assertSucceeds(getDocs(query(collection(alice(), 'orders'), where('ownerId', '==', 'alice'))))
    // bob querying alice's orders, or an unscoped query, is denied.
    await assertFails(getDocs(query(collection(bob(), 'orders'), where('ownerId', '==', 'alice'))))
    await assertFails(getDocs(collection(alice(), 'orders')))
  })
})

describe('customers rules', () => {
  it('lets a user create a customer under their own uid only', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'customers/c1'), customer('alice')))
    await assertFails(setDoc(doc(alice(), 'customers/c2'), customer('bob')))
  })

  it('lets the owner read their customer but hides it from others', async () => {
    await seed('customers/c1', customer('alice'))
    await assertSucceeds(getDoc(doc(alice(), 'customers/c1')))
    await assertFails(getDoc(doc(bob(), 'customers/c1')))
  })
})

describe('counters rules', () => {
  it('lets a user read/write only their own per-owner counter', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'counters/alice'), { lastOrderNumber: 1 }))
    await assertSucceeds(getDoc(doc(alice(), 'counters/alice')))
    await assertFails(setDoc(doc(alice(), 'counters/bob'), { lastOrderNumber: 1 }))
    await assertFails(getDoc(doc(bob(), 'counters/alice')))
  })
})

describe('default deny', () => {
  it('blocks access to any other collection, even when authenticated', async () => {
    await assertFails(getDoc(doc(alice(), 'secrets/s1')))
    await assertFails(setDoc(doc(alice(), 'secrets/s1'), { x: 1 }))
  })
})
