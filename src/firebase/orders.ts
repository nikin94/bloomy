import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './client'
import { STORED_ORDER_SCHEMA } from '../types/order'
import type { Order } from '../types/order'

const ORDERS_COLLECTION = 'orders'
// Per-owner counters: counters/{ownerId}.lastOrderNumber holds the highest
// order number issued to that owner so far. Numbering is per-owner so every
// user's orders start at 1, independent of other tenants.
const COUNTERS_COLLECTION = 'counters'

// Data needed to create an order. `id` is assigned by Firestore on write and
// `number` is assigned by the create transaction, so the caller provides neither.
export type NewOrder = Omit<Order, 'id' | 'number'>

// Firestore document -> validated Order. Throws on schema mismatch — surfacing
// bad data loudly is fine while the app is in test mode.
const parseOrder = (id: string, data: unknown): Order => ({ id, ...STORED_ORDER_SCHEMA.parse(data) })

// Load the orders owned by the given app user (for the list table). We filter
// by `ownerId` and sort newest-first in memory: a server-side `ownerId`
// equality + `dateCreated` order would need a composite index, and the dataset
// per owner is small enough to sort on the client. Soft-deleted orders are
// dropped client-side so they vanish from the list without a hard delete.
export async function fetchOrders(ownerId: string): Promise<Order[]> {
  const q = query(collection(db, ORDERS_COLLECTION), where('ownerId', '==', ownerId))
  const snapshot = await getDocs(q)
  return snapshot.docs
    .map((d) => parseOrder(d.id, d.data()))
    .filter((o) => !o.isDeleted)
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
  const order = parseOrder(snapshot.id, snapshot.data())
  // Foreign or soft-deleted orders are treated as gone, so a stale link to a
  // deleted order shows "not found" rather than letting it be viewed or edited.
  if (order.ownerId !== ownerId || order.isDeleted) return null
  return order
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

// Overwrite an existing order in place (used by the edit screen). Unlike
// createOrder, this does NOT run the numbering transaction: editing must keep
// the order's id and human-readable `number`, so the caller passes the full
// document — including the original `number` and `dateCreated` — and we replace
// it wholesale. A wholesale replace (not a merge) means fields the user cleared,
// e.g. the comment, are actually removed rather than lingering.
export async function updateOrder(id: string, order: Omit<Order, 'id'>): Promise<void> {
  await setDoc(doc(db, ORDERS_COLLECTION, id), order)
}

// Soft-delete an order: flip `isDeleted` so it drops out of the list and detail
// page, without removing the document. The per-owner number counter is left
// untouched — kept docs mean numbering can never collide, and the hidden order
// stays recoverable (a real order deleted by mistake is one flag-flip away). A
// partial `updateDoc` (not setDoc) leaves every other field intact. Owner-scoped
// Firestore rules already permit this update (ownerId is unchanged).
export async function softDeleteOrder(id: string): Promise<void> {
  await updateDoc(doc(db, ORDERS_COLLECTION, id), { isDeleted: true })
}
