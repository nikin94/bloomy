import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { STORED_CUSTOMER_SCHEMA } from '../types/customer'
import type { Customer, NewCustomer } from '../types/customer'

const CUSTOMERS_COLLECTION = 'customers'

// Validate a Firestore document against the stored Customer schema, returning a
// typed Customer or null on mismatch. We log and skip (rather than throw) so a
// single corrupt or legacy document can't break the whole list/picker.
function parseCustomer(id: string, data: unknown): Customer | null {
  const parsed = STORED_CUSTOMER_SCHEMA.safeParse(data)
  if (!parsed.success) {
    console.warn(`Skipping customer ${id}: does not match schema`, parsed.error.issues)
    return null
  }
  return { id, ...parsed.data }
}

// Load all customers owned by the given app user (for the order-form picker and
// for resolving names in the orders list). A single-field `ownerId` equality
// filter, so Firestore needs no composite index.
export async function fetchCustomers(ownerId: string): Promise<Customer[]> {
  const q = query(collection(db, CUSTOMERS_COLLECTION), where('ownerId', '==', ownerId))
  const snapshot = await getDocs(q)
  return snapshot.docs
    .map((d) => parseCustomer(d.id, d.data()))
    .filter((customer): customer is Customer => customer !== null)
}

// Load a single customer by id (e.g. to show the live name on the order page).
export async function fetchCustomer(id: string): Promise<Customer | null> {
  const snapshot = await getDoc(doc(db, CUSTOMERS_COLLECTION, id))
  if (!snapshot.exists()) return null
  return parseCustomer(snapshot.id, snapshot.data())
}

// Create a customer document and return its generated id.
export async function createCustomer(customer: NewCustomer): Promise<string> {
  const ref = await addDoc(collection(db, CUSTOMERS_COLLECTION), customer)
  return ref.id
}
