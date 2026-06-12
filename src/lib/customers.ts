import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import type { Customer, NewCustomer } from '../types/customer'

const CUSTOMERS_COLLECTION = 'customers'

// Firestore document -> Customer. Kept in one place to adjust as fields change.
function mapDoc(id: string, data: Record<string, unknown>): Customer {
  // TODO: unsafe cast — add runtime validation (zod/valibot) as a separate task.
  return { id, ...(data as Omit<Customer, 'id'>) }
}

// Load all customers owned by the given app user (for the order-form picker and
// for resolving names in the orders list). A single-field `ownerId` equality
// filter, so Firestore needs no composite index.
export async function fetchCustomers(ownerId: string): Promise<Customer[]> {
  const q = query(collection(db, CUSTOMERS_COLLECTION), where('ownerId', '==', ownerId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => mapDoc(d.id, d.data()))
}

// Load a single customer by id (e.g. to show the live name on the order page).
export async function fetchCustomer(id: string): Promise<Customer | null> {
  const snapshot = await getDoc(doc(db, CUSTOMERS_COLLECTION, id))
  return snapshot.exists() ? mapDoc(snapshot.id, snapshot.data()) : null
}

// Create a customer document and return its generated id.
export async function createCustomer(customer: NewCustomer): Promise<string> {
  const ref = await addDoc(collection(db, CUSTOMERS_COLLECTION), customer)
  return ref.id
}
