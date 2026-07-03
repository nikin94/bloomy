import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './client'
import { STORED_CUSTOMER_SCHEMA } from '@/types/customer'
import type { Customer, NewCustomer } from '@/types/customer'
import { reportError } from '@/observability/reportError'

// The user-editable fields of a customer. `ownerId`, `createdAt` and `isDeleted`
// are managed by the app, not edited through the form.
export type CustomerEdits = Pick<Customer, 'name'> &
  Partial<Pick<Customer, 'phone' | 'address' | 'note'>>

const CUSTOMERS_COLLECTION = 'customers'

// Firestore document -> validated Customer. Throws on schema mismatch —
// surfacing bad data loudly is fine while the app is in test mode.
const parseCustomer = (id: string, data: unknown): Customer => ({
  id,
  ...STORED_CUSTOMER_SCHEMA.parse(data),
})

// Load the customers owned by the given app user. A single-field `ownerId`
// equality filter, so Firestore needs no composite index.
//
// Soft-deleted customers are excluded by default — the address book and the
// order-form picker want only active customers. Pass `includeDeleted: true` to
// keep them, which the orders list needs so a past order whose customer was
// deleted still resolves the name instead of falling back to "—".
export async function fetchCustomers(
  ownerId: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<Customer[]> {
  const q = query(collection(db, CUSTOMERS_COLLECTION), where('ownerId', '==', ownerId))
  const snapshot = await getDocs(q)
  const customers = snapshot.docs.map((d) => parseCustomer(d.id, d.data()))
  return includeDeleted ? customers : customers.filter((c) => !c.isDeleted)
}

// Load a single customer by id (e.g. to show the live name on the order page).
export async function fetchCustomer(id: string): Promise<Customer | null> {
  const snapshot = await getDoc(doc(db, CUSTOMERS_COLLECTION, id))
  return snapshot.exists() ? parseCustomer(snapshot.id, snapshot.data()) : null
}

// Create a customer document and return its generated id IMMEDIATELY, without
// waiting for the server. Like createOrder, this makes it work OFFLINE: the id
// is generated locally (no network) and the write is queued in the local cache,
// flushed on reconnect. New customers are created as part of an offline order,
// so the order can reference this id at once. The write promise is not awaited
// (it would hang offline); a genuine failure is routed to reportError (Sentry).
export function createCustomer(customer: NewCustomer): string {
  const ref = doc(collection(db, CUSTOMERS_COLLECTION))
  void setDoc(ref, customer).catch((err) => reportError(err, 'createCustomer'))
  return ref.id
}

// Update a customer's editable fields. Fire-and-forget (like createOrder /
// createCustomer): the write is NOT awaited, so it never blocks the UI and works
// OFFLINE — the change lands in the local cache at once and flushes to the server
// on reconnect. A genuine failure (e.g. an online permission-denied) has no
// caller to catch it, so it is routed to reportError (Sentry). Optional fields
// (phone/address/note) that come in empty are removed via `deleteField()` rather
// than stored as "" — so clearing a field actually clears it and the stored shape
// stays clean. `ownerId`/`createdAt`/`isDeleted` are left untouched.
export function updateCustomer(id: string, edits: CustomerEdits): void {
  const optional = (value: string | undefined) =>
    value && value.trim() !== '' ? value.trim() : deleteField()
  void updateDoc(doc(db, CUSTOMERS_COLLECTION, id), {
    name: edits.name.trim(),
    phone: optional(edits.phone),
    address: optional(edits.address),
    note: optional(edits.note),
  }).catch((err) => reportError(err, 'updateCustomer'))
}

// Soft-delete a customer: flip `isDeleted` so it drops out of the address book
// and picker, without removing the document. Past orders keep resolving its name
// (they reference it by id and store no name snapshot), so the order history is
// never silently rewritten — the reason we soft-delete instead of `deleteDoc`.
// Fire-and-forget like every other mutation, so it works offline and never hangs
// the confirm dialog; a failed write is reported to Sentry.
export function softDeleteCustomer(id: string): void {
  void updateDoc(doc(db, CUSTOMERS_COLLECTION, id), { isDeleted: true }).catch((err) =>
    reportError(err, 'softDeleteCustomer'),
  )
}
