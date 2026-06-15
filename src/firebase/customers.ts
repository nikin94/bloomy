import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
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

// Load all customers owned by the given app user (for the order-form picker and
// for resolving names in the orders list). A single-field `ownerId` equality
// filter, so Firestore needs no composite index.
export async function fetchCustomers(ownerId: string): Promise<Customer[]> {
  const q = query(collection(db, CUSTOMERS_COLLECTION), where('ownerId', '==', ownerId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => parseCustomer(d.id, d.data()))
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
