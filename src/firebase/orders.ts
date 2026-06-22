import {
  collection,
  deleteField,
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
import { reportError } from '../observability/reportError'

const ORDERS_COLLECTION = 'orders'
// Per-owner counters: counters/{ownerId}.lastOrderNumber holds the highest
// order number issued to that owner so far. Numbering is per-owner so every
// user's orders start at 1, independent of other tenants.
const COUNTERS_COLLECTION = 'counters'

// Data needed to create an order. `id` is assigned by Firestore on write and
// `number` is assigned by reconcileOrderNumbers, so the caller provides neither.
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

// Load the owner's soft-deleted orders (for the trash page), newest-first. Same
// owner-scoped query as fetchOrders, but keeps ONLY the deleted ones — the
// complement of that list — so the trash shows exactly what the main list hides.
export async function fetchDeletedOrders(ownerId: string): Promise<Order[]> {
  const q = query(collection(db, ORDERS_COLLECTION), where('ownerId', '==', ownerId))
  const snapshot = await getDocs(q)
  return snapshot.docs
    .map((d) => parseOrder(d.id, d.data()))
    .filter((o) => o.isDeleted)
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

// Create a new order and return its generated document id IMMEDIATELY, without
// waiting for the server to acknowledge the write.
//
// This is what makes order creation work OFFLINE. The human-readable `number`
// can't be issued here: it needs a transaction on the owner's counter, and
// Firestore transactions require the server (they can't run offline). So the
// order is written with `number: null` and gets a real number later, from
// reconcileOrderNumbers, once the client is online. The doc id is generated
// locally (no network), so we return it at once; the write is queued in the
// local cache and flushed on reconnect.
//
// The write promise is deliberately NOT awaited: awaiting it would hang offline
// (the promise only resolves once the server confirms). So the create never
// blocks the UI. A genuinely failed write (e.g. an online permission-denied)
// has no caller to catch it, so it is routed to reportError (Sentry).
export function createOrder(order: NewOrder): string {
  const orderRef = doc(collection(db, ORDERS_COLLECTION))
  void setDoc(orderRef, { ...order, number: null }).catch((err) =>
    reportError(err, 'createOrder'),
  )
  return orderRef.id
}

// Assign real per-owner numbers to any of the owner's orders still created
// offline (number === null). Runs online (it uses transactions). For each
// unnumbered order, in creation order, a transaction reads the owner's counter,
// bumps it by one and stamps the order — atomically, so the counter is never
// double-issued even if two devices reconcile at the same time. The transaction
// re-reads the order inside itself and skips if another device already numbered
// it, so reconciling twice is safe and idempotent.
//
// Returns true if it numbered at least one order (the caller can then refetch).
// Best-effort: if a transaction fails (offline / Firebase unreachable), it stops
// and leaves the rest unnumbered for the next online reconcile — never throws.
export async function reconcileOrderNumbers(ownerId: string): Promise<boolean> {
  const q = query(collection(db, ORDERS_COLLECTION), where('ownerId', '==', ownerId))
  const snapshot = await getDocs(q)
  const unnumbered = snapshot.docs
    .filter((d) => d.data().number === null)
    .sort((a, b) => ((a.data().dateCreated as number) ?? 0) - ((b.data().dateCreated as number) ?? 0))

  let numberedAny = false
  const counterRef = doc(db, COUNTERS_COLLECTION, ownerId)
  for (const docSnap of unnumbered) {
    const orderRef = doc(db, ORDERS_COLLECTION, docSnap.id)
    try {
      await runTransaction(db, async (tx) => {
        const orderSnap = await tx.get(orderRef)
        // Gone, or already numbered by another device since we listed — skip.
        if (!orderSnap.exists() || orderSnap.data()?.number !== null) return
        const counterSnap = await tx.get(counterRef)
        const lastNumber = (counterSnap.data()?.lastOrderNumber as number | undefined) ?? 0
        const nextNumber = lastNumber + 1
        tx.set(counterRef, { lastOrderNumber: nextNumber }, { merge: true })
        tx.update(orderRef, { number: nextNumber })
      })
      numberedAny = true
    } catch {
      // Offline / Firebase blocked: the remaining orders would fail the same
      // way, so stop and try again on the next online load.
      break
    }
  }
  return numberedAny
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

// Restore a soft-deleted order: REMOVE the `isDeleted` field (rather than store
// `false`) so a restored order returns to its pristine, never-deleted shape —
// matching how an active order has no flag at all. A partial update leaves every
// other field intact; owner-scoped Firestore rules already permit it.
export async function restoreOrder(id: string): Promise<void> {
  await updateDoc(doc(db, ORDERS_COLLECTION, id), { isDeleted: deleteField() })
}
