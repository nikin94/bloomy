import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'
import type { Order } from '../types/order'

const ORDERS_COLLECTION = 'orders'

// Документ Firestore -> Order. Точная схема в Firestore ещё уточняется,
// поэтому маппинг держим в одном месте, чтобы менять при изменении полей.
function mapDoc(id: string, data: Record<string, unknown>): Order {
  // TODO: unsafe cast — Firestore может вернуть данные, не соответствующие Order.
  // Добавить runtime-валидацию (zod/valibot) отдельной задачей.
  return { id, ...(data as Omit<Order, 'id'>) }
}

// Загрузить список заказов (для таблицы-списка).
export async function fetchOrders(): Promise<Order[]> {
  const q = query(collection(db, ORDERS_COLLECTION), orderBy('dateCreated', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => mapDoc(d.id, d.data()))
}

// Загрузить один заказ по id (для страницы заказа).
export async function fetchOrder(id: string): Promise<Order | null> {
  const snapshot = await getDoc(doc(db, ORDERS_COLLECTION, id))
  return snapshot.exists() ? mapDoc(snapshot.id, snapshot.data()) : null
}
