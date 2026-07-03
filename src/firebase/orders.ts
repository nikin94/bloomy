import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './client'
import { STORED_ORDER_SCHEMA, TRASH_RETENTION_DAYS, isOrderDeleted } from '../types/order'
import type { Order, PaymentStatus, ShipmentStatus } from '../types/order'
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
    .filter((o) => !isOrderDeleted(o))
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
    .filter((o) => isOrderDeleted(o))
    .sort((a, b) => b.dateCreated - a.dateCreated)
}

// Load a single order by id (for the order page). We re-check `ownerId` on the
// client so a signed-in user cannot open another tenant's order by guessing or
// leaking its doc id. This is defense-in-depth in the UI — owner-scoped
// Firestore security rules remain the real boundary — but it keeps foreign data
// off the screen even before/independent of those rules.
//
// By default a soft-deleted order is treated as gone (a stale link shows "not
// found"). Pass `includeDeleted` to view one from the trash — the detail page
// uses it to render a deleted order read-only with a Restore action, instead of
// dead-ending. A FOREIGN order is always gone, regardless of the flag.
export async function fetchOrder(
  id: string,
  ownerId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Order | null> {
  const snapshot = await getDoc(doc(db, ORDERS_COLLECTION, id))
  if (!snapshot.exists()) return null
  const order = parseOrder(snapshot.id, snapshot.data())
  if (order.ownerId !== ownerId) return null
  if (isOrderDeleted(order) && !options.includeDeleted) return null
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
//
// `id` is optional: the create form pre-generates it (via newOrderId) so photos
// can be uploaded under orders/{ownerId}/{id}/ BEFORE the doc exists, then passes
// the SAME id here — keeping the photo path's orderId in lockstep with the doc id
// (the cleanup function keys photo deletion off that segment). Omitted elsewhere,
// where a fresh local id is generated.
export function createOrder(order: NewOrder, id?: string): string {
  const orderRef = id ? doc(db, ORDERS_COLLECTION, id) : doc(collection(db, ORDERS_COLLECTION))
  void setDoc(orderRef, { ...order, number: null }).catch((err) =>
    reportError(err, 'createOrder'),
  )
  return orderRef.id
}

// A fresh, locally-generated order document id (no network). The create form
// uses this to know an order's id up front, so photos can be uploaded under its
// storage path before the order document is written (see createOrder's `id`).
export const newOrderId = (): string => doc(collection(db, ORDERS_COLLECTION)).id

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

// Optional order fields that can be CLEARED by an edit. The edit form omits a
// field it has no value for (an empty comment, a non-completed order), so on a
// per-field merge those omissions must become explicit removals — otherwise an
// omitted field would just linger (see updateOrder).
const CLEARABLE_ORDER_FIELDS = ['comment', 'completedAt'] as const

// Save an edited order in place (used by the edit screen). Unlike createOrder,
// this runs NO numbering transaction: editing keeps the order's id and
// human-readable `number`, so the caller passes the full field set (including
// the original `number` and `dateCreated`).
//
// PER-FIELD MERGE: writes with `updateDoc` (not `setDoc`), so each field is set
// individually. That matters offline across two devices — if the phone changed
// the status while the desktop edits the address, the two writes touch different
// fields and BOTH survive the sync, instead of a wholesale `setDoc` replace
// clobbering whichever synced last. The edit form sends every form field, so a
// field the user cleared (comment, completedAt) is absent here; we turn those
// absences into `deleteField()` so clearing still clears rather than lingering.
//
// Fire-and-forget (like createOrder): the write is NOT awaited, so saving an edit
// never blocks and works OFFLINE — it lands in the local cache at once and flushes
// on reconnect. A genuine failure (e.g. an online permission-denied) has no caller
// to catch it, so it is routed to reportError (Sentry).
export function updateOrder(id: string, order: Omit<Order, 'id'>): void {
  const writes: Record<string, unknown> = { ...order }
  for (const field of CLEARABLE_ORDER_FIELDS) {
    if (!(field in order)) writes[field] = deleteField()
  }
  void updateDoc(doc(db, ORDERS_COLLECTION, id), writes).catch((err) =>
    reportError(err, 'updateOrder'),
  )
}

// A partial inline edit — sets ONLY the named fields, used for the order page's
// inline status changes. `completedAt: null` removes the completion stamp (when
// an order leaves a terminal status); any other value is written as-is.
//
// This is the strongest case for the per-field merge: a single inline toggle
// ("mark paid/shipped") writes just that one field, so it merges
// cleanly with a concurrent edit to any OTHER field on another device — the
// frequent two-device action. updateOrder would instead resend the whole order.
export type OrderPatch = Partial<{
  paymentStatus: PaymentStatus
  shipmentStatus: ShipmentStatus
  completedAt: number | null
  // The full new list of photo storage paths (read-modify-write on the client).
  // Written as a single field so a photo add/remove merges cleanly with a
  // concurrent status change on another device.
  photos: string[]
}>

// Fire-and-forget, like updateOrder — the inline toggle never blocks and works
// offline; a failed write is reported to Sentry.
export function patchOrder(id: string, patch: OrderPatch): void {
  const writes: Record<string, unknown> = { ...patch }
  // null is the caller's signal to remove the stamp; map it to deleteField so
  // the field is dropped, not stored as a literal null (which the schema rejects).
  if (patch.completedAt === null) writes.completedAt = deleteField()
  void updateDoc(doc(db, ORDERS_COLLECTION, id), writes).catch((err) =>
    reportError(err, 'patchOrder'),
  )
}

// Soft-delete an order: move it to the trash without removing the document. The
// per-owner number counter is left untouched — kept docs mean numbering can never
// collide, and the hidden order stays recoverable (one restore away). Stamps:
//   • `deletedAt` (ms) — the canonical "in trash" signal + the purge-countdown seed;
//   • `purgeAt` (Firestore Timestamp) — deletedAt + retention; the field a TTL
//     policy watches to auto-delete the document once the window lapses.
// `Timestamp.fromMillis` is a pure client value (no server round-trip), so this
// stays offline-safe. A partial `updateDoc` (not setDoc) leaves every other field
// intact; owner-scoped Firestore rules already permit it (ownerId is unchanged).
// Fire-and-forget so it works offline; a failed write is reported to Sentry.
export function softDeleteOrder(id: string): void {
  const now = Date.now()
  const purgeAt = Timestamp.fromMillis(now + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  void updateDoc(doc(db, ORDERS_COLLECTION, id), { deletedAt: now, purgeAt }).catch((err) =>
    reportError(err, 'softDeleteOrder'),
  )
}

// Restore a soft-deleted order: REMOVE every trash field (rather than store a
// "false") so a restored order returns to its pristine, never-deleted shape — an
// active order carries none of these. Clears the new `deletedAt`/`purgeAt` AND the
// legacy `isDeleted` flag, so an order trashed before the switch restores cleanly
// too. A partial update leaves every other field intact; owner-scoped Firestore
// rules already permit it. Fire-and-forget so it works offline; a failed write is
// reported to Sentry.
export function restoreOrder(id: string): void {
  void updateDoc(doc(db, ORDERS_COLLECTION, id), {
    deletedAt: deleteField(),
    purgeAt: deleteField(),
    isDeleted: deleteField(),
  }).catch((err) => reportError(err, 'restoreOrder'))
}
