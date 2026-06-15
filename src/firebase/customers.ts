import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './client'
import { STORED_CUSTOMER_SCHEMA } from '../types/customer'
import type { Customer, NewCustomer } from '../types/customer'

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

// Create a customer document and return its generated id.
export async function createCustomer(customer: NewCustomer): Promise<string> {
  const ref = await addDoc(collection(db, CUSTOMERS_COLLECTION), customer)
  return ref.id
}

// Soft-delete a customer: flip `isDeleted` so it drops out of the address book
// and picker, without removing the document. Past orders keep resolving its name
// (they reference it by id and store no name snapshot), so the order history is
// never silently rewritten — the reason we soft-delete instead of `deleteDoc`.
export async function softDeleteCustomer(id: string): Promise<void> {
  await updateDoc(doc(db, CUSTOMERS_COLLECTION, id), { isDeleted: true })
}
