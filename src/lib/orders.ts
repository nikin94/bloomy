import { addDoc, collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'
import type { Order } from '../types/order'

const ORDERS_COLLECTION = 'orders'

// Data needed to create an order. `id` is assigned by Firestore on write.
export type NewOrder = Omit<Order, 'id'>

// Firestore document -> Order. The exact Firestore schema is still being
// finalized, so we keep the mapping in one place to adjust as fields change.
function mapDoc(id: string, data: Record<string, unknown>): Order {
  // TODO: unsafe cast — Firestore may return data that does not match Order.
  // Add runtime validation (zod/valibot) as a separate task.
  return { id, ...(data as Omit<Order, 'id'>) }
}

// Load the list of orders (for the list table).
export async function fetchOrders(): Promise<Order[]> {
  const q = query(collection(db, ORDERS_COLLECTION), orderBy('dateCreated', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => mapDoc(d.id, d.data()))
}

// Load a single order by id (for the order page).
export async function fetchOrder(id: string): Promise<Order | null> {
  const snapshot = await getDoc(doc(db, ORDERS_COLLECTION, id))
  return snapshot.exists() ? mapDoc(snapshot.id, snapshot.data()) : null
}

// Create a new order document and return its generated id.
export async function createOrder(order: NewOrder): Promise<string> {
  const ref = await addDoc(collection(db, ORDERS_COLLECTION), order)
  return ref.id
}
