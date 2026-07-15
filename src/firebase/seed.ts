import { collection, doc, getDocs, query, setDoc, Timestamp, where, writeBatch } from 'firebase/firestore'
import { db } from './client'
import { TRASH_RETENTION_DAYS } from '@/types/order'
import type { NewCustomer } from '@/types/customer'
import type { Currency, DeliveryMethod, Order, OrderItem, PaymentMethod } from '@/types/order'

// Test-data seeder. Wipes the signed-in admin's orders/customers (optional) and
// fills the account with a realistic spread of mock data so the UI can be
// exercised end-to-end: orders across every status/method, some in the trash,
// plus an address book that includes a couple of soft-deleted customers.
//
// Everything is DETERMINISTIC (index-driven, no Math.random) so the builders are
// unit-testable and a re-seed produces the same fixtures. The shapes are built
// to satisfy STORED_ORDER_SCHEMA / STORED_CUSTOMER_SCHEMA — the seed tests parse
// every generated doc through those schemas, so a future field change that would
// break the seeder is caught in CI, not in production.
//
// Owner-scoped like the rest of the data layer: it only ever reads/writes
// documents whose ownerId is the caller's uid, so it runs under the admin's own
// login and needs no service account or rules change.

const ORDERS_COLLECTION = 'orders'
const CUSTOMERS_COLLECTION = 'customers'
const COUNTERS_COLLECTION = 'counters'

const DAY_MS = 24 * 60 * 60 * 1000

// How many of each to generate. Orders are spread so every status/method appears
// and a slice lands in the trash; customers include a couple of soft-deleted.
export const SEED_ORDER_COUNT = 100
const SEED_DELETED_CUSTOMER_COUNT = 2

const PAYMENT_STATUSES = ['pending', 'paid', 'refunded'] as const
const SHIPMENT_STATUSES = ['new', 'packing', 'shipped', 'delivered', 'cancelled'] as const
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'bank']
const DELIVERY_METHODS: DeliveryMethod[] = ['bus', 'post', 'pickup', 'cdek', 'taxi', 'other']
const TERMINAL = new Set(['delivered', 'cancelled'])

// Potted house plants (the shop sells plants in pots, not cut flowers), so the
// seeded line items read like the real catalogue.
const PLANT_NAMES = [
  'Филодендрон Биркин-пинк',
  'Филодендрон Белая принцесса',
  'Сансевиерия Муншайн',
  'Монстера Деликатесная',
  'Замиокулькас',
  'Фикус Лирата',
  'Калатея Орбифолия',
  'Спатифиллум',
  'Алоказия Полли',
  'Эпипремнум Голден',
  'Драцена Маргината',
  'Хлорофитум Бонни',
]

// Street names, and cities paired with a realistic postal index, used to build
// full delivery addresses (see buildAddress). Index-driven, so deterministic.
const STREET_NAMES = [
  'Тараса Шевченко',
  'Большая Морская',
  'Адмирала Октябрьского',
  'Героев Севастополя',
  'Ленина',
  'Гоголя',
  'Пушкина',
  'Нахимова',
  'Очаковцев',
  'Льва Толстого',
]

const CITIES: { city: string; index: string }[] = [
  { city: 'г. Севастополь', index: '299011' },
  { city: 'г. Симферополь', index: '295000' },
  { city: 'г. Ялта', index: '298600' },
  { city: 'г. Евпатория', index: '297400' },
  { city: 'г. Керчь', index: '298300' },
  { city: 'г. Феодосия', index: '298100' },
  { city: 'г. Бахчисарай', index: '298400' },
]

// A full delivery address, deterministic off the index: street + house, an
// apartment on most (every 4th is a private house with no flat), then city +
// postal index — e.g. "ул. Тараса Шевченко, д. 21, кв. 91, г. Севастополь, 299011".
function buildAddress(i: number): string {
  const street = STREET_NAMES[i % STREET_NAMES.length]
  const { city, index } = CITIES[i % CITIES.length]
  const house = 1 + ((i * 7) % 120)
  const parts = [`ул. ${street}`, `д. ${house}`]
  if (i % 4 !== 0) parts.push(`кв. ${1 + ((i * 13) % 200)}`)
  parts.push(city, index)
  return parts.join(', ')
}

// A fixed cast of customers; the last SEED_DELETED_CUSTOMER_COUNT are marked
// soft-deleted so the orders list can be checked to still resolve their names.
const CUSTOMER_FIXTURES: { name: string; phone?: string; address?: string; note?: string }[] = [
  { name: 'Анна Смирнова', phone: '+7 900 111-22-33', address: 'ул. Пушкина, 10', note: 'Любит пионы' },
  { name: 'Борис Ковалёв', phone: '+7 900 222-33-44', address: 'пр. Ленина, 5' },
  { name: 'Виктория Орлова', phone: '+7 900 333-44-55', address: 'ул. Садовая, 22', note: 'Только самовывоз' },
  { name: 'Григорий Зайцев', phone: '+7 900 444-55-66' },
  { name: 'Дарья Морозова', phone: '+7 900 555-66-77', address: 'ул. Лесная, 8' },
  { name: 'Евгений Соколов', address: 'ул. Речная, 14' },
  { name: 'Жанна Беляева', phone: '+7 900 666-77-88', address: 'пер. Тихий, 3', note: 'Перезванивать после 18:00' },
  { name: 'Игорь Васильев', phone: '+7 900 777-88-99' },
  { name: 'Ксения Петрова', phone: '+7 900 888-99-00', address: 'ул. Цветочная, 1' },
  { name: 'Леонид Фролов', phone: '+7 900 999-00-11', address: 'ул. Полевая, 7' },
  { name: 'Мария Гусева', phone: '+7 900 123-45-67', address: 'ул. Зелёная, 19' },
  { name: 'Никита Лебедев', phone: '+7 900 234-56-78' },
]

// Build the address-book fixtures for the given owner. Deterministic: createdAt
// is staggered by index off `now`, and the trailing few are soft-deleted.
export function buildSeedCustomers(ownerId: string, now: number): NewCustomer[] {
  const deletedFrom = CUSTOMER_FIXTURES.length - SEED_DELETED_CUSTOMER_COUNT
  return CUSTOMER_FIXTURES.map((c, i) => ({
    ownerId,
    name: c.name,
    createdAt: now - (CUSTOMER_FIXTURES.length - i) * DAY_MS,
    ...(c.phone ? { phone: c.phone } : {}),
    ...(c.address ? { address: c.address } : {}),
    ...(c.note ? { note: c.note } : {}),
    ...(i >= deletedFrom ? { isDeleted: true } : {}),
  }))
}

// Per-order currency. Mostly roubles (the operator's default), with a slice of
// USD and EUR so the multi-currency UI has data to exercise — the per-currency
// revenue cards (stats + customer page) and the currency-scoped price filter.
// There is no conversion: the number is whatever the operator entered, just
// labelled in that currency. Deterministic off the index, and on a period (mod 7)
// that is OFFSET from the trash modulo (mod 6) so USD/EUR land in BOTH the active
// list and the trash, not only one — otherwise a currency could vanish from the
// active revenue totals.
function pickCurrency(i: number): Currency {
  if (i % 7 === 3) return 'USD'
  if (i % 7 === 5) return 'EUR'
  return 'RUB'
}

// One order's line items: 1–3 potted plants cycled off the index, with varied
// qty/price. Prices land in a realistic ~500–2500 (50-step) band, in the same
// ballpark as the real catalogue (in the order's own currency — no conversion).
function buildPlants(i: number): OrderItem[] {
  const count = 1 + (i % 3)
  return Array.from({ length: count }, (_, k) => ({
    name: PLANT_NAMES[(i + k) % PLANT_NAMES.length],
    quantity: 1 + ((i + k) % 5),
    unitPriceMinor: (500 + ((i * 7 + k * 11) % 41) * 50) * 100,
  }))
}

// Build SEED_ORDER_COUNT orders for the owner, linked round-robin to the given
// customer ids. Numbered 1..N oldest-first; every status/method is covered, a
// slice (`isDeleted`) lands in the trash, and terminal orders get a completedAt.
export function buildSeedOrders(
  ownerId: string,
  customerIds: string[],
  now: number,
): Omit<Order, 'id'>[] {
  if (customerIds.length === 0) throw new Error('buildSeedOrders needs at least one customer id')
  return Array.from({ length: SEED_ORDER_COUNT }, (_, i) => {
    const shipmentStatus = SHIPMENT_STATUSES[i % SHIPMENT_STATUSES.length]
    const dateCreated = now - (SEED_ORDER_COUNT - i) * DAY_MS
    const isTerminal = TERMINAL.has(shipmentStatus)
    return {
      number: i + 1,
      dateCreated,
      ownerId,
      customerId: customerIds[i % customerIds.length],
      address: buildAddress(i),
      plants: buildPlants(i),
      paymentMethod: PAYMENT_METHODS[i % PAYMENT_METHODS.length],
      deliveryMethod: DELIVERY_METHODS[i % DELIVERY_METHODS.length],
      deliveryPriceMinor: (i % 4) * 25000,
      currency: pickCurrency(i),
      paymentStatus: PAYMENT_STATUSES[i % PAYMENT_STATUSES.length],
      shipmentStatus,
      ...(i % 4 === 0 ? { comment: `Тестовый комментарий №${i + 1}` } : {}),
      ...(isTerminal ? { completedAt: Math.min(now, dateCreated + 3 * DAY_MS) } : {}),
      // ~1 in 6 lands in the trash so the "Trash" page has content. Stamped with
      // a staggered `deletedAt` (the canonical trash signal) so the seeded trash
      // shows a varied auto-purge countdown — elapsed 0..23 days → 30..7 days left.
      ...(i % 6 === 5 ? { deletedAt: now - (i % 24) * DAY_MS } : {}),
    }
  })
}

// The Firestore write payload for a seeded order. A TRASHED order (has
// `deletedAt`) additionally carries `purgeAt` — the Firestore Timestamp the real
// softDeleteOrder writes and the server-side TTL policy keys on (deletedAt + the
// retention window). Stamping it here makes seeded trash auto-purge-eligible
// exactly like a hand-deleted order, instead of lingering forever. Kept OUT of the
// pure builder because purgeAt is a Timestamp, not part of the Order schema (which
// strips it on read); the builder stays schema-shaped and unit-testable.
function seedOrderPayload(order: Omit<Order, 'id'>): Record<string, unknown> {
  if (order.deletedAt === undefined) return order
  const purgeAt = Timestamp.fromMillis(order.deletedAt + TRASH_RETENTION_DAYS * DAY_MS)
  return { ...order, purgeAt }
}

// Commit writes in batches under Firestore's 500-op limit (headroom at 400).
async function commitInBatches(ops: ((batch: ReturnType<typeof writeBatch>) => void)[]): Promise<void> {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + 400)) op(batch)
    await batch.commit()
  }
}

// Hard-delete every document the owner has in a collection (used by reset).
// Returns how many were removed.
async function deleteOwnerCollection(name: string, ownerId: string): Promise<number> {
  const snap = await getDocs(query(collection(db, name), where('ownerId', '==', ownerId)))
  await commitInBatches(snap.docs.map((d) => (batch) => batch.delete(d.ref)))
  return snap.size
}

export interface SeedResult {
  reset: boolean
  removedOrders: number
  removedCustomers: number
  customers: number
  orders: number
  trashed: number
}

export interface WipeResult {
  removedOrders: number
  removedCustomers: number
}

// Hard-delete EVERY order and customer the owner has (active and trashed alike),
// and reset the per-owner number counter so the next real order starts at №1.
// The admin-tab "wipe" tool ahead of the status migration: the admin clears
// their own test data first, so the migration only ever touches real users'
// documents. Owner-scoped like the seeder — runs under the admin's login, the
// rules never let it touch anyone else's data.
export async function wipeOwnerData(ownerId: string): Promise<WipeResult> {
  const removedOrders = await deleteOwnerCollection(ORDERS_COLLECTION, ownerId)
  const removedCustomers = await deleteOwnerCollection(CUSTOMERS_COLLECTION, ownerId)
  await setDoc(doc(db, COUNTERS_COLLECTION, ownerId), { lastOrderNumber: 0 })
  return { removedOrders, removedCustomers }
}

// Seed the owner's account with mock data. When `reset` is true, the owner's
// existing orders and customers are hard-deleted first (a clean slate); without
// it the fixtures are added alongside whatever is already there.
//
// The per-owner number counter is set to the highest seeded number, so the next
// real order created in the app continues the sequence instead of colliding.
export async function seedMockData(
  ownerId: string,
  { reset }: { reset: boolean },
  now: number = Date.now(),
): Promise<SeedResult> {
  let removedOrders = 0
  let removedCustomers = 0
  if (reset) {
    removedOrders = await deleteOwnerCollection(ORDERS_COLLECTION, ownerId)
    removedCustomers = await deleteOwnerCollection(CUSTOMERS_COLLECTION, ownerId)
  }

  const customers = buildSeedCustomers(ownerId, now)
  const customerRefs = customers.map(() => doc(collection(db, CUSTOMERS_COLLECTION)))
  const orders = buildSeedOrders(
    ownerId,
    customerRefs.map((r) => r.id),
    now,
  )
  const orderRefs = orders.map(() => doc(collection(db, ORDERS_COLLECTION)))

  await commitInBatches([
    ...customers.map((c, i) => (batch: ReturnType<typeof writeBatch>) => batch.set(customerRefs[i], c)),
    ...orders.map(
      (o, i) => (batch: ReturnType<typeof writeBatch>) => batch.set(orderRefs[i], seedOrderPayload(o)),
    ),
  ])

  // Keep the counter ahead of the seeded numbers so real creates don't collide.
  await setDoc(doc(db, COUNTERS_COLLECTION, ownerId), { lastOrderNumber: orders.length })

  return {
    reset,
    removedOrders,
    removedCustomers,
    customers: customers.length,
    orders: orders.length,
    // Trashed = has `deletedAt` (the canonical trash signal the seeder stamps).
    // The old `o.isDeleted` check counted a field the seeder never sets, so this
    // always reported 0 in the admin UI despite the seeded trash.
    trashed: orders.filter((o) => o.deletedAt !== undefined).length,
  }
}
