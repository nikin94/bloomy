import { collection, doc, getDoc, getDocs, query, runTransaction, where } from 'firebase/firestore'
import { db } from './firebase'
import type { Order } from '../types/order'

const ORDERS_COLLECTION = 'orders'
// Per-owner counters: counters/{ownerId}.lastOrderNumber holds the highest
// order number issued to that owner so far. Numbering is per-owner so every
// user's orders start at 1, independent of other tenants.
const COUNTERS_COLLECTION = 'counters'

// Data needed to create an order. `id` is assigned by Firestore on write and
// `number` is assigned by the create transaction, so the caller provides neither.
export type NewOrder = Omit<Order, 'id' | 'number'>

// Firestore document -> Order. The exact Firestore schema is still being
// finalized, so we keep the mapping in one place to adjust as fields change.
function mapDoc(id: string, data: Record<string, unknown>): Order {
  // TODO: unsafe cast — Firestore may return data that does not match Order.
  // Add runtime validation (zod/valibot) as a separate task.
  return { id, ...(data as Omit<Order, 'id'>) }
}

// Load the orders owned by the given app user (for the list table). We filter
// by `ownerId` and sort newest-first in memory: a server-side `ownerId`
// equality + `dateCreated` order would need a composite index, and the dataset
// per owner is small enough to sort on the client.
export async function fetchOrders(ownerId: string): Promise<Order[]> {
  const q = query(collection(db, ORDERS_COLLECTION), where('ownerId', '==', ownerId))
  const snapshot = await getDocs(q)
  return snapshot.docs
    .map((d) => mapDoc(d.id, d.data()))
    .sort((a, b) => b.dateCreated - a.dateCreated)
}

// Load a single order by id (for the order page). We re-check `ownerId` on the
// client so a signed-in user cannot open another tenant's order by guessing or
// leaking its doc id. This is defense-in-depth in the UI — owner-scoped
// Firestore security rules remain the real boundary — but it keeps foreign data
// off the screen even before/independent of those rules.
export async function fetchOrder(id: string, ownerId: string): Promise<Order | null> {
  const snapshot = await getDoc(doc(db, ORDERS_COLLECTION, id))
  if (!snapshot.exists()) return null
  const order = mapDoc(snapshot.id, snapshot.data())
  return order.ownerId === ownerId ? order : null
}

// Create a new order and return its generated document id.
//
// Firestore has no auto-increment, so the human-readable `number` is issued by
// a transaction: read the owner's counter, bump it by one, and stamp the order
// with that value — all atomically, so two concurrent creates can never get the
// same number. The URL key stays the random doc id; `number` is display-only.
export async function createOrder(order: NewOrder): Promise<string> {
  const orderRef = doc(collection(db, ORDERS_COLLECTION))
  const counterRef = doc(db, COUNTERS_COLLECTION, order.ownerId)

  await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef)
    const lastNumber = (counterSnap.data()?.lastOrderNumber as number | undefined) ?? 0
    const nextNumber = lastNumber + 1
    tx.set(counterRef, { lastOrderNumber: nextNumber }, { merge: true })
    tx.set(orderRef, { ...order, number: nextNumber })
  })

  return orderRef.id
}
