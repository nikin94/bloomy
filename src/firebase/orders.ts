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
  waitForPendingWrites,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './client'
import { STORED_ORDER_SCHEMA, isOrderDeleted } from '@/types/order'
import type { Order, OrderStatus, PaymentStatus } from '@/types/order'
import { reportError } from '@/observability/reportError'

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

// What one reconcile pass achieved: `numbered` — at least one order got its
// real number (the caller refetches the lists); `remaining` — unnumbered orders
// were left behind because a transaction failed (Firestore unreachable), so the
// caller should re-arm a retry instead of assuming the pass finished the job.
export interface ReconcileResult {
  numbered: boolean
  remaining: boolean
}

// Assign real per-owner numbers to any of the owner's orders still created
// offline (number === null). Runs online (it uses transactions). For each
// unnumbered order, in creation order, a transaction reads the owner's counter,
// bumps it by one and stamps the order — atomically, so the counter is never
// double-issued even if two devices reconcile at the same time. The transaction
// re-reads the order inside itself and skips if another device already numbered
// it, so reconciling twice is safe and idempotent.
//
// Best-effort: if a transaction fails (Firestore unreachable), it stops and
// reports `remaining: true` so the caller can retry once connectivity is truly
// back (see waitForWriteQueueFlush) — but it never throws past the getDocs.
//
// The failure is REPORTED when the browser believes it is online: that is the
// invisible case — the network is "up" but Firestore specifically is blocked
// (antivirus SSL inspection), so the `online` event never fires and, before
// this report, the numbering could silently stall for days (orders №15+ stuck
// at null while their create writes did reach the server through brief
// connectivity windows). A plain offline browser stays quiet — that path is
// routine and would only burn the Sentry quota.
export async function reconcileOrderNumbers(ownerId: string): Promise<ReconcileResult> {
  const q = query(collection(db, ORDERS_COLLECTION), where('ownerId', '==', ownerId))
  const snapshot = await getDocs(q)
  const unnumbered = snapshot.docs
    .filter((d) => d.data().number === null)
    .sort((a, b) => ((a.data().dateCreated as number) ?? 0) - ((b.data().dateCreated as number) ?? 0))

  let numbered = false
  const counterRef = doc(db, COUNTERS_COLLECTION, ownerId)
  for (const docSnap of unnumbered) {
    const orderRef = doc(db, ORDERS_COLLECTION, docSnap.id)
    try {
      // The transaction reports whether it actually stamped a number: a skip
      // (doc gone / already numbered elsewhere) must not claim success — the
      // old boolean did, triggering pointless list refetches.
      const stamped = await runTransaction(db, async (tx) => {
        const orderSnap = await tx.get(orderRef)
        // Gone, or already numbered by another device since we listed — skip.
        if (!orderSnap.exists() || orderSnap.data()?.number !== null) return false
        const counterSnap = await tx.get(counterRef)
        const lastNumber = (counterSnap.data()?.lastOrderNumber as number | undefined) ?? 0
        const nextNumber = lastNumber + 1
        tx.set(counterRef, { lastOrderNumber: nextNumber }, { merge: true })
        tx.update(orderRef, { number: nextNumber })
        return true
      })
      if (stamped) numbered = true
    } catch (err) {
      // Firebase unreachable: the remaining orders would fail the same way, so
      // stop this pass. Report ONLY when the browser thinks it's online (see
      // the function comment) — a genuinely offline device stays quiet.
      if (typeof navigator === 'undefined' || navigator.onLine) {
        reportError(err, 'reconcileOrderNumbers')
      }
      return { numbered, remaining: true }
    }
  }
  return { numbered, remaining: false }
}

// Resolves once every write queued in the local offline cache has been
// acknowledged by the server. GLOBAL semantics, on purpose: this is the whole
// Firestore write queue — settings and customer writes drain it too, so a
// resolve does NOT prove an order write specifically landed. That is fine for
// what it is used as: a CONNECTIVITY signal, not an order-level ack — the
// browser `online` event never fires when only Firestore is blocked (the
// network itself stays "up"), so the numbering retry keys off this instead;
// a premature resolve just runs one extra reconcile pass, which reports
// remaining and re-arms. Resolves immediately when the queue is already empty
// (see the retry floor in useReconcileOrderNumbers, which keeps that case from
// spinning the bounded retry loop hot).
export const waitForWriteQueueFlush = (): Promise<void> => waitForPendingWrites(db)

// Optional order fields that can be CLEARED by an edit. The edit form omits a
// field it has no value for (an empty comment, a non-completed order), so on a
// per-field merge those omissions must become explicit removals — otherwise an
// omitted field would just linger (see updateOrder). `photos` is here because
// the edit form now owns the photo list too: removing the last photo omits the
// key, and the merge must drop the stored list rather than leave it pointing at
// files that were just deleted from Storage.
// `source` rides the same mechanism: unchecking "Заказ с Авито" on an edit
// omits the field, which must delete the stored value, not leave it lingering.
const CLEARABLE_ORDER_FIELDS = [
  'comment',
  'completedAt',
  'gifts',
  'photos',
  'source',
  'prepaidAmountMinor',
] as const

// Field-level equality for the diff below. The order's fields are primitives or
// small arrays of plain objects built with a stable key order (plants/gifts/photos),
// so a JSON comparison is exact here — no need for a deep-equal library.
const sameFieldValue = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b)

// Save an edited order in place (used by the edit screen). Unlike createOrder,
// this runs NO numbering transaction: editing keeps the order's id and
// human-readable `number`, so the caller passes the full field set (including
// the original `number` and `dateCreated`).
//
// PER-FIELD MERGE, FOR REAL: writes with `updateDoc` AND — when the caller
// supplies `base`, the order as it was when the form mounted — only the fields
// the edit actually CHANGED. Previously the full field set was always written,
// which silently re-sent mount-time values: an inline status change made on the
// detail page (or another device) between opening the edit form and saving it
// was overwritten back, and its completedAt stamp deleteField()'d away. Diffing
// against `base` means an untouched field is simply absent from the write, so a
// concurrent change to it survives. A field the user CLEARED (in `base`, absent
// now — comment, completedAt, gifts, photos) becomes an explicit `deleteField()`
// so clearing still clears rather than lingering.
//
// Without `base` (no snapshot to diff against) the legacy full-write behaviour
// applies: every field is sent and absent clearable fields are deleted — a
// whole-document last-write-wins.
//
// Fire-and-forget (like createOrder): the write is NOT awaited, so saving an edit
// never blocks and works OFFLINE — it lands in the local cache at once and flushes
// on reconnect. A genuine failure (e.g. an online permission-denied) has no caller
// to catch it, so it is routed to reportError (Sentry).
export function updateOrder(id: string, order: Omit<Order, 'id'>, base?: Omit<Order, 'id'>): void {
  const next = order as Record<string, unknown>
  const prev = base as Record<string, unknown> | undefined
  const writes: Record<string, unknown> = {}
  for (const key of Object.keys(next)) {
    if (!prev || !sameFieldValue(prev[key], next[key])) writes[key] = next[key]
  }
  for (const field of CLEARABLE_ORDER_FIELDS) {
    if (field in next) continue
    // With a base, only clear a field the order actually HAD.
    if (!prev || field in prev) writes[field] = deleteField()
  }
  void updateDoc(doc(db, ORDERS_COLLECTION, id), writes).catch((err) =>
    // The doc id in the tag makes a failed save actionable from the logs: the
    // form deletes/uploads Storage files around this write, so a rejected write
    // can leave orphan blobs under orders/{ownerId}/{id}/ — the id says where.
    reportError(err, `updateOrder:${id}`),
  )
}

// A partial inline edit — sets ONLY the named fields, used for the order page's
// inline status changes. `completedAt: null` removes the completion stamp (when
// an order leaves a terminal status); any other value is written as-is.
//
// This is the strongest case for the per-field merge: a single inline toggle
// ("mark paid/done") writes just that one field, so it merges
// cleanly with a concurrent edit to any OTHER field on another device — the
// frequent two-device action. updateOrder would instead resend the whole order.
export type OrderPatch = Partial<{
  paymentStatus: PaymentStatus
  status: OrderStatus
  completedAt: number | null
  // The full new list of photo storage paths (read-modify-write on the client).
  // KNOWN LIMIT: two tabs editing the same order's photos concurrently are
  // last-write-wins — the loser's uploaded blob stays orphaned in Storage.
  // Accepted for this single-user app (arrayUnion/arrayRemove would fix adds
  // but break the user-visible display ORDER the array encodes).
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
    reportError(err, `patchOrder:${id}`),
  )
}

// Soft-delete an order: move it to the trash without removing the document. The
// per-owner number counter is left untouched — kept docs mean numbering can never
// collide, and the hidden order stays recoverable (one restore away). Stamps only
// `deletedAt` (ms) — the canonical "in trash" signal. Trashed orders stay in the
// trash INDEFINITELY (owner decision: the old 30-day TTL auto-purge is gone);
// they leave it only via Restore or the trash page's explicit "empty trash"
// hard delete (see hardDeleteOrders). A partial `updateDoc` (not setDoc) leaves
// every other field intact; owner-scoped Firestore rules already permit it
// (ownerId is unchanged). Fire-and-forget so it works offline; a failed write is
// reported to Sentry.
export function softDeleteOrder(id: string): void {
  void updateDoc(doc(db, ORDERS_COLLECTION, id), { deletedAt: Date.now() }).catch((err) =>
    reportError(err, 'softDeleteOrder'),
  )
}

// PERMANENTLY delete orders (the trash page's "empty trash"): removes the
// documents themselves — no soft-delete flag, no way back. Photo files are NOT
// touched here: the cleanupOrderPhotos cloud function fires on every document
// delete and sweeps `orders/{ownerId}/{orderId}/` from Storage server-side (the
// same path the admin reset relies on). Deletes are batched under Firestore's
// 500-writes-per-batch cap; each batch commit is fire-and-forget so emptying the
// trash never blocks the UI and works offline (queued deletes flush on
// reconnect). A failed commit is reported to Sentry.
export function hardDeleteOrders(ids: string[]): void {
  const BATCH_LIMIT = 400 // headroom under Firestore's hard 500-writes cap
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const id of ids.slice(i, i + BATCH_LIMIT)) {
      batch.delete(doc(db, ORDERS_COLLECTION, id))
    }
    void batch.commit().catch((err) => reportError(err, 'hardDeleteOrders'))
  }
}

// Restore a soft-deleted order: REMOVE every trash field (rather than store a
// "false") so a restored order returns to its pristine, never-deleted shape — an
// active order carries none of these. Clears `deletedAt`, the legacy `isDeleted`
// flag AND `purgeAt` (the retired TTL timestamp the old auto-purge wrote —
// documents trashed before the purge was removed still carry it, so restoring is
// also the lazy cleanup). A partial update leaves every other field intact;
// owner-scoped Firestore rules already permit it. Fire-and-forget so it works
// offline; a failed write is reported to Sentry.
export function restoreOrder(id: string): void {
  void updateDoc(doc(db, ORDERS_COLLECTION, id), {
    deletedAt: deleteField(),
    purgeAt: deleteField(),
    isDeleted: deleteField(),
  }).catch((err) => reportError(err, 'restoreOrder'))
}
