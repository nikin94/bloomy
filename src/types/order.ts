import { z } from 'zod'

// Status/method unions are defined as Zod enums so the runtime validator (used
// when reading Firestore documents) and the TypeScript types share a single
// source of truth. We still avoid `enum` — tsconfig enables erasableSyntaxOnly,
// which forbids it; the inferred string-literal unions are erasable.
export const PAYMENT_STATUS_SCHEMA = z.enum(['pending', 'paid', 'refunded'])
export type PaymentStatus = z.infer<typeof PAYMENT_STATUS_SCHEMA>

// The order's workflow status ("статус заказа" — formerly the SHIPMENT status,
// hence the legacy stored field name below). Reduced to exactly three states by
// owner decision: an order is being worked on, done, or cancelled. Named
// ORDER_STATUS (not just STATUS) because PaymentStatus lives right beside it.
export const ORDER_STATUS_SCHEMA = z.enum(['processing', 'delivered', 'cancelled'])
export type OrderStatus = z.infer<typeof ORDER_STATUS_SCHEMA>

// The retired status VALUES real production documents still carry. They must
// stay READABLE until migrateOrderStatuses has rewritten every user's orders —
// narrowing a stored enum before the data is migrated makes parseOrder throw
// and crashes the whole list (the `packing` lesson). All of them meant "still
// being worked on", so they normalize to 'processing'.
export const LEGACY_ORDER_STATUSES = ['new', 'packing', 'shipped'] as const
const LEGACY_SET: ReadonlySet<string> = new Set(LEGACY_ORDER_STATUSES)

// What the DOCUMENT may hold (current + legacy values), collapsed to the current
// three-state union on parse. Every read path goes through this, so the rest of
// the app only ever sees 'processing' | 'delivered' | 'cancelled'; the lazy
// migration rewrites the stored value to match (see migrateOrderStatuses).
export const STORED_ORDER_STATUS_SCHEMA = z
  .enum([...LEGACY_ORDER_STATUSES, ...ORDER_STATUS_SCHEMA.options])
  .transform((s): OrderStatus => (LEGACY_SET.has(s) ? 'processing' : (s as OrderStatus)))

// The status field was RENAMED in storage: documents written before the rename
// hold it as `shipmentStatus`, current ones as `status`. Lift the legacy field
// into `status` before validation so both shapes parse; when both are somehow
// present, the new field wins. Shared by the stored-order schema and the form
// draft (whose saved copies predate the rename the same way); the lazy
// migration (migrateOrderStatuses) renames the field in the documents themselves.
export const liftLegacyStatusField = (data: unknown): unknown =>
  data !== null &&
  typeof data === 'object' &&
  !('status' in data) &&
  'shipmentStatus' in data
    ? { ...data, status: (data as Record<string, unknown>).shipmentStatus }
    : data

export const PAYMENT_METHOD_SCHEMA = z.enum(['cash', 'card', 'bank'])
export type PaymentMethod = z.infer<typeof PAYMENT_METHOD_SCHEMA>

// How the order is delivered. Keys are latin (stable storage values); the
// localized labels live in the `order` i18n ns and the display order is built in
// deliveryMethodOptions (alphabetical by label, with the "other" catch-all pinned last).
export const DELIVERY_METHOD_SCHEMA = z.enum(['bus', 'post', 'pickup', 'cdek', 'taxi', 'other'])
export type DeliveryMethod = z.infer<typeof DELIVERY_METHOD_SCHEMA>

// Currency an order is priced in. Per-order and FIXED: an order always shows in
// the currency it was created with — there is NO conversion, the number is the
// exact amount the operator entered (relabelling 1500₽ as $1500 would lie about
// the value). The settings default seeds a NEW order; an existing order keeps
// its own. All three are 2-decimal, so the integer minor-unit model (amount/100)
// holds; a 0/3-decimal currency (JPY/KWD) would need a per-currency divisor —
// none are offered. The code IS the value, so it doubles as the option label.
export const CURRENCY_SCHEMA = z.enum(['RUB', 'USD', 'EUR'])
export type Currency = z.infer<typeof CURRENCY_SCHEMA>
export const CURRENCIES = CURRENCY_SCHEMA.options

// A single line item in an order — a plant/flower.
// Starts as plain text (the plant name); saved together with quantity and a
// unit price. Amounts are integers in minor units (kopecks) to avoid float
// rounding errors; the unit price is a snapshot taken at order time.
export const ORDER_ITEM_SCHEMA = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
})
export type OrderItem = z.infer<typeof ORDER_ITEM_SCHEMA>

// The stored order document — every field Firestore holds for an order. The
// document id is the technical key (used in URLs/links) and is added on top as
// `Order`, not stored in the body, so it lives outside this schema.
//
// Money model: items are the source of truth. Subtotal and total are NOT
// stored — they are derived from the items (see getSubtotalMinor/getTotalMinor).
// Only delivery is an independent input and is stored. This keeps the order a
// live "notebook": editing items recomputes the totals, no stale snapshot.
//
// Wrapped in a preprocess that lifts the legacy `shipmentStatus` field into
// `status` (see liftLegacyStatusField), so documents from before the rename
// parse without waiting for the lazy migration to rewrite them.
export const STORED_ORDER_SCHEMA = z.preprocess(
  liftLegacyStatusField,
  z.object({
  // Per-owner sequential number. NULLABLE because an order can be created while
  // OFFLINE, where the numbering transaction (which needs the server) can't run:
  // such an order is written with `number: null` and gets its real number later,
  // by reconcileOrderNumbers, once the client is back online. A synced order
  // always has a positive int; `null` means "created offline, not yet numbered".
  number: z.number().int().positive().nullable(),
  dateCreated: z.number(), // timestamp (ms)
  ownerId: z.string().min(1), // app user UID that owns this order (multi-tenancy)
  customerId: z.string().min(1), // link to Customer — the live source of the customer name
  address: z.string(), // delivery address (may differ from the customer default)
  plants: z.array(ORDER_ITEM_SCHEMA).min(1), // at least one plant, enforced by the form
  paymentMethod: PAYMENT_METHOD_SCHEMA,
  // Added after orders already existed; default keeps pre-existing documents
  // (which have no deliveryMethod) valid. New orders always set it from the form.
  deliveryMethod: DELIVERY_METHOD_SCHEMA.default('post'),
  deliveryPriceMinor: z.number().int().nonnegative(), // minor units (kopecks)
  // Currency the order is priced in. Widened from a RUB-only literal to the
  // supported set; existing documents (all 'RUB') stay valid, so this is a safe
  // widening with no migration. New orders write the chosen currency.
  currency: CURRENCY_SCHEMA,
  // Gift plants included with the order for free. Same item shape as `plants`
  // (a gift IS a plant), but a SEPARATE array so the money selectors — which
  // read only `plants` — never count a gift into the subtotal/total/revenue.
  // Stored as an array to leave room for several gifts per order later; TODAY
  // the form allows at most one (quantity 1, unitPriceMinor 0). A non-empty
  // array is the "order includes a gift" signal — no separate boolean flag that
  // could drift out of sync. Optional so every pre-existing document stays
  // valid without a migration (widening is safe; narrowing is not).
  gifts: z.array(ORDER_ITEM_SCHEMA).optional(),
  paymentStatus: PAYMENT_STATUS_SCHEMA,
  status: STORED_ORDER_STATUS_SCHEMA,
  comment: z.string().optional(),
  // When the order was completed (ms timestamp). An order is "completed" once it
  // reaches a terminal status (delivered or cancelled); this is stamped
  // automatically on that transition and cleared if it leaves one (see
  // resolveCompletedAt). Optional so orders that aren't finished — and any
  // written before this field existed — stay valid without a migration.
  completedAt: z.number().optional(),
  // Soft-delete timestamp (ms). Set when the order is moved to the trash; absent
  // for an active order. This is the CANONICAL "in trash" signal and also seeds
  // the auto-purge countdown (deletedAt + TRASH_RETENTION_DAYS). Optional so an
  // active order — and any document written before this field — stays valid.
  // Distinct from "cancelled", which is an order status that keeps the order
  // visible. See `isOrderDeleted` / `trashDaysLeft`.
  deletedAt: z.number().optional(),
  // LEGACY soft-delete flag, superseded by `deletedAt`. Kept readable so an order
  // soft-deleted before the switch still counts as trashed (see `isOrderDeleted`)
  // — narrowing a stored field is unsafe (the `packing` lesson), so we keep
  // honouring it rather than dropping it. New deletions write `deletedAt`, not
  // this; `restoreOrder` clears both. A separate `purgeAt` Firestore Timestamp is
  // also written on delete for the TTL purge — it is not read here, so the schema
  // (which strips unknown keys) intentionally omits it.
  isDeleted: z.boolean().optional(),
  // Storage paths of attached order photos, in display order. Each entry is a
  // PATH under `orders/{ownerId}/{orderId}/{photoId}.jpg` in Firebase Storage —
  // NOT a download URL (URLs are resolved lazily and their tokens can rotate, so
  // a stored URL would go stale). Optional and added after orders already
  // existed, so pre-existing orders stay valid without a migration (widening the
  // schema is safe; narrowing is not — see the `packing` lesson).
  photos: z.array(z.string()).optional(),
  }),
)

// A single order for potted plants and flowers = one table row. The doc id is
// added to the stored shape.
export type Order = z.infer<typeof STORED_ORDER_SCHEMA> & { id: string }

// Display label for an order's number. An order created offline has no number
// yet (null) until it syncs and reconcileOrderNumbers assigns one; show an em
// dash for that transient state so the UI never prints "№null".
export const formatOrderNumber = (number: number | null): string =>
  number === null ? '—' : String(number)

// Days a soft-deleted order stays in the trash before it is permanently purged.
// Shared by the client (the countdown warning + delete-confirm copy) and the
// server-side TTL purge, so both agree on the retention window.
export const TRASH_RETENTION_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

// True when an order is in the trash. `deletedAt` (set on soft-delete) is the
// canonical signal; the legacy boolean `isDeleted` is still honoured so an order
// trashed before `deletedAt` existed stays in the trash.
export const isOrderDeleted = (order: Order): boolean =>
  order.deletedAt !== undefined || order.isDeleted === true

// Whole days left before a trashed order is auto-purged, given the current time.
// Returns null for a legacy `isDeleted`-only order with no `deletedAt` (it
// predates the countdown), so the caller can omit the countdown for it. Floored
// at 0 so an expired-but-not-yet-purged order reads "0 days", never negative.
export const trashDaysLeft = (order: Order, now: number): number | null => {
  if (order.deletedAt === undefined) return null
  const purgeAt = order.deletedAt + TRASH_RETENTION_DAYS * DAY_MS
  return Math.max(0, Math.ceil((purgeAt - now) / DAY_MS))
}

// Derived money selectors. All amounts are integers in minor units (kopecks).
// Subtotal = sum of item line totals; total = subtotal + delivery.
export const getSubtotalMinor = (order: Order): number =>
  order.plants.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0)

export const getTotalMinor = (order: Order): number =>
  getSubtotalMinor(order) + order.deliveryPriceMinor

// An order is "completed" once it is delivered or cancelled — both are terminal
// states with no further work to do on the order.
export const TERMINAL_ORDER_STATUSES = ['delivered', 'cancelled'] as const

export const isTerminalOrderStatus = (status: OrderStatus): boolean =>
  (TERMINAL_ORDER_STATUSES as readonly OrderStatus[]).includes(status)

// The completion timestamp an order should carry for a given order status.
// Entering a terminal status stamps the completion time (keeping an existing
// stamp on a re-save, so the original completion moment survives); a
// non-terminal status clears it. Pure (takes `now`) so it stays unit-testable
// and is applied wherever the status is written — the create/edit form
// and the inline status save on the detail page.
export const resolveCompletedAt = (
  status: OrderStatus,
  previousCompletedAt: number | undefined,
  now: number,
): number | undefined =>
  isTerminalOrderStatus(status) ? (previousCompletedAt ?? now) : undefined

// Plants ordered for display: the most valuable line first (unit price ×
// quantity), descending. Returns a copy, so the stored order array is never
// mutated. Used wherever the plant list is shown (orders table + detail page).
export const plantsByValueDesc = (plants: OrderItem[]): OrderItem[] =>
  [...plants].sort((a, b) => b.unitPriceMinor * b.quantity - a.unitPriceMinor * a.quantity)

// --- Aggregate stats (customer page; reused later by the statistics tab) ------
//
// All computed in memory from already-loaded orders, so they stay offline-safe
// and need no extra reads or schema change. Callers pass an ALREADY-FILTERED
// list (e.g. one customer's orders, deleted ones excluded) — these helpers don't
// filter by owner/customer/trash themselves.

// Total PAID revenue grouped by currency (minor units). Orders priced in
// different currencies are never summed together — there is no conversion (see
// the multi-currency model) — so the result is one running total per currency.
// Only `paid` orders count as revenue; pending/refunded and cancelled don't.
export const revenueByCurrencyMinor = (orders: Order[]): Map<Currency, number> => {
  const totals = new Map<Currency, number>()
  for (const order of orders) {
    if (order.paymentStatus !== 'paid') continue
    totals.set(order.currency, (totals.get(order.currency) ?? 0) + getTotalMinor(order))
  }
  return totals
}

// The most-ordered plants across the given orders, by total quantity (summed
// across every order), highest first. Returns at most `limit` { name, quantity }
// entries — used for the customer page's "frequent plants" summary.
export const topPlantsByQuantity = (
  orders: Order[],
  limit: number,
): { name: string; quantity: number }[] => {
  const totals = new Map<string, number>()
  for (const order of orders) {
    for (const plant of order.plants) {
      totals.set(plant.name, (totals.get(plant.name) ?? 0) + plant.quantity)
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, quantity]) => ({ name, quantity }))
}

// Distinct plant names across the given orders, trimmed and sorted (ru locale),
// for the order form's name autocomplete. Deduped case-insensitively, keeping the
// FIRST-seen original casing as the suggestion — so picking one reuses an exact
// existing spelling. That is the whole point: fewer near-duplicate names ("Кактус"
// vs "кактус") means cleaner per-plant stats. Blank names are dropped.
export const collectPlantNames = (orders: Order[]): string[] => {
  const byKey = new Map<string, string>()
  for (const order of orders) {
    for (const plant of order.plants) {
      const name = plant.name.trim()
      if (name === '') continue
      const key = name.toLowerCase()
      if (!byKey.has(key)) byKey.set(key, name)
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'ru'))
}

// Every gift occurrence across the given orders (the caller passes an
// already-filtered list, e.g. one customer's orders), newest first, each
// stamped with the date of the order it was sent with. Deliberately NOT
// deduped: the customer page lists each handed-over gift as its own row — two
// orders gifting the same plant are two separate givings, and the dates are
// what tells them apart. (The order form's "already sent" warning keeps its
// own case-insensitive per-customer set — a repeat only needs flagging once
// there.) Blank names are dropped, mirroring the form's blank-row drop.
export interface GiftOccurrence {
  name: string
  dateCreated: number // the carrying order's creation timestamp (ms)
  orderId: string
}
export const giftsByDateDesc = (orders: Order[]): GiftOccurrence[] => {
  const entries: GiftOccurrence[] = []
  for (const order of orders) {
    for (const gift of order.gifts ?? []) {
      const name = gift.name.trim()
      if (name === '') continue
      entries.push({ name, dateCreated: order.dateCreated, orderId: order.id })
    }
  }
  return entries.sort((a, b) => b.dateCreated - a.dateCreated)
}

// Compact per-line label for the orders-table list: the name, plus the quantity
// as ×N only when it is more than 1 (a quantity of 1 is the common case and just
// adds noise).
export const plantLineLabel = (item: OrderItem): string =>
  item.quantity === 1 ? item.name : `${item.name} ×${item.quantity}`

// Canonical option values, in display order. Status/method values keep their
// workflow order (e.g. processing → delivered). Labels are NOT stored here:
// they are resolved per render from the `order` i18n namespace, so the UI follows
// the chosen language (the latin value IS the translation key, so a value can
// never drift apart from its label).
export const PAYMENT_STATUS_VALUES = PAYMENT_STATUS_SCHEMA.options
export const ORDER_STATUS_VALUES = ORDER_STATUS_SCHEMA.options
export const PAYMENT_METHOD_VALUES = PAYMENT_METHOD_SCHEMA.options
export const DELIVERY_METHOD_VALUES = DELIVERY_METHOD_SCHEMA.options

// Active filters for the orders list. An empty string in a status field means
// "any"; an empty query matches everything. The price range is in minor units
// (kopecks): `minPriceMinor` defaults to 0 and `maxPriceMinor` is null when
// there is no upper bound (the order total is matched against this range).
export interface OrderFilter {
  query: string
  paymentStatus: PaymentStatus | ''
  status: OrderStatus | ''
  // Empty string means "any currency"; otherwise the order's currency must match.
  currency: Currency | ''
  minPriceMinor: number
  maxPriceMinor: number | null
  // Inclusive creation-date range (ms). null on a side means that bound is open.
  // Set from the filter dialog's date fields, or seeded when a monthly-chart bar
  // on the statistics tab is clicked (opens the list scoped to that month).
  minDate: number | null
  maxDate: number | null
}

export const EMPTY_ORDER_FILTER: OrderFilter = {
  query: '',
  paymentStatus: '',
  status: '',
  currency: '',
  minPriceMinor: 0,
  maxPriceMinor: null,
  minDate: null,
  maxDate: null,
}

// True when no filter is active — used to tell "no orders yet" apart from
// "nothing matched the filter".
export const isOrderFilterActive = (filter: OrderFilter): boolean =>
  filter.query.trim() !== '' || isModalFilterActive(filter)

// True when any filter that lives behind the filter dialog is set (payment
// status, order status, or the price range). Drives the filter-icon's active
// dot — the inline search query is shown separately and isn't counted here.
export const isModalFilterActive = (filter: OrderFilter): boolean =>
  filter.paymentStatus !== '' ||
  filter.status !== '' ||
  filter.currency !== '' ||
  filter.minPriceMinor > 0 ||
  filter.maxPriceMinor !== null ||
  filter.minDate !== null ||
  filter.maxDate !== null

// Filter the orders list in memory (the dataset is small and already loaded, so
// no extra query). `query` matches the order number, the resolved customer name,
// or any plant name, case- and whitespace-insensitive; each set status must
// match exactly; the order total must fall within the price range and its
// creation date within the date range. The customer
// name is resolved via the same lookup the table uses, so a search finds orders
// by who they belong to even though the order stores only an id.
export const filterOrders = (
  orders: Order[],
  filter: OrderFilter,
  getCustomerName: (customerId: string) => string,
): Order[] => {
  const q = filter.query.trim().toLowerCase()
  return orders.filter((o) => {
    if (filter.paymentStatus !== '' && o.paymentStatus !== filter.paymentStatus) return false
    if (filter.status !== '' && o.status !== filter.status) return false
    if (filter.currency !== '' && o.currency !== filter.currency) return false
    const total = getTotalMinor(o)
    if (total < filter.minPriceMinor) return false
    if (filter.maxPriceMinor !== null && total > filter.maxPriceMinor) return false
    if (filter.minDate !== null && o.dateCreated < filter.minDate) return false
    if (filter.maxDate !== null && o.dateCreated > filter.maxDate) return false
    if (q === '') return true
    const plantNames = o.plants.map((p) => p.name).join(' ')
    // `number ?? ''` so an unsynced order (number null) isn't searchable as the
    // literal "null"; it still matches by customer/plant.
    return `${o.number ?? ''} ${getCustomerName(o.customerId)} ${plantNames}`
      .toLowerCase()
      .includes(q)
  })
}
