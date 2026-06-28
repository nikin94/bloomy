import { z } from 'zod'
import type { TFunction } from 'i18next'
import { formatDate, formatTime, formatMoney } from '../utils/format'

// Status/method unions are defined as Zod enums so the runtime validator (used
// when reading Firestore documents) and the TypeScript types share a single
// source of truth. We still avoid `enum` — tsconfig enables erasableSyntaxOnly,
// which forbids it; the inferred string-literal unions are erasable.
export const PAYMENT_STATUS_SCHEMA = z.enum(['pending', 'paid', 'refunded'])
export type PaymentStatus = z.infer<typeof PAYMENT_STATUS_SCHEMA>

// Shipment status of an order, in workflow order. 'packing' must stay here:
// real production orders are saved with it, so dropping it makes parseOrder throw
// on those documents and crashes the whole list.
export const SHIPMENT_STATUS_SCHEMA = z.enum([
  'new',
  'packing',
  'shipped',
  'delivered',
  'cancelled',
])
export type ShipmentStatus = z.infer<typeof SHIPMENT_STATUS_SCHEMA>

export const PAYMENT_METHOD_SCHEMA = z.enum(['cash', 'card', 'bank'])
export type PaymentMethod = z.infer<typeof PAYMENT_METHOD_SCHEMA>

// How the order is delivered. Keys are latin (stable storage values); the
// localized labels live in the `order` i18n ns and the display order is built in
// deliveryMethodOptions (alphabetical by label, with the "other" catch-all pinned last).
export const DELIVERY_METHOD_SCHEMA = z.enum(['bus', 'post', 'pickup', 'cdek', 'taxi', 'other'])
export type DeliveryMethod = z.infer<typeof DELIVERY_METHOD_SCHEMA>

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
export const STORED_ORDER_SCHEMA = z.object({
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
  currency: z.literal('RUB'),
  paymentStatus: PAYMENT_STATUS_SCHEMA,
  shipmentStatus: SHIPMENT_STATUS_SCHEMA,
  comment: z.string().optional(),
  // When the order was completed (ms timestamp). An order is "completed" once it
  // reaches a terminal shipment status (delivered or cancelled); this is stamped
  // automatically on that transition and cleared if it leaves one (see
  // resolveCompletedAt). Optional so orders that aren't finished — and any
  // written before this field existed — stay valid without a migration.
  completedAt: z.number().optional(),
  // Soft-delete flag. A "deleted" order is hidden from the list and the detail
  // page, but the document is kept so the per-owner numbering stays intact (a
  // hard delete would risk an unrecoverable loss of a real order and gaps in the
  // counter). Optional so orders written before this field stay valid. Distinct
  // from "cancelled", which is a shipment status that keeps the order visible.
  isDeleted: z.boolean().optional(),
  // Storage paths of attached order photos, in display order. Each entry is a
  // PATH under `orders/{ownerId}/{orderId}/{photoId}.jpg` in Firebase Storage —
  // NOT a download URL (URLs are resolved lazily and their tokens can rotate, so
  // a stored URL would go stale). Optional and added after orders already
  // existed, so pre-existing orders stay valid without a migration (widening the
  // schema is safe; narrowing is not — see the `packing` lesson).
  photos: z.array(z.string()).optional(),
})

// A single order for potted plants and flowers = one table row. The doc id is
// added to the stored shape.
export type Order = z.infer<typeof STORED_ORDER_SCHEMA> & { id: string }

// Display label for an order's number. An order created offline has no number
// yet (null) until it syncs and reconcileOrderNumbers assigns one; show an em
// dash for that transient state so the UI never prints "№null".
export const formatOrderNumber = (number: number | null): string =>
  number === null ? '—' : String(number)

// Derived money selectors. All amounts are integers in minor units (kopecks).
// Subtotal = sum of item line totals; total = subtotal + delivery.
export const getSubtotalMinor = (order: Order): number =>
  order.plants.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0)

export const getTotalMinor = (order: Order): number =>
  getSubtotalMinor(order) + order.deliveryPriceMinor

// An order is "completed" once it is delivered or cancelled — both are terminal
// shipment states with no further work to do on the order.
export const TERMINAL_SHIPMENT_STATUSES = ['delivered', 'cancelled'] as const

export const isTerminalShipmentStatus = (status: ShipmentStatus): boolean =>
  (TERMINAL_SHIPMENT_STATUSES as readonly ShipmentStatus[]).includes(status)

// The completion timestamp an order should carry for a given shipment status.
// Entering a terminal status stamps the completion time (keeping an existing
// stamp on a re-save, so the original completion moment survives); a
// non-terminal status clears it. Pure (takes `now`) so it stays unit-testable
// and is applied wherever the shipment status is written — the create/edit form
// and the inline status save on the detail page.
export const resolveCompletedAt = (
  shipmentStatus: ShipmentStatus,
  previousCompletedAt: number | undefined,
  now: number,
): number | undefined =>
  isTerminalShipmentStatus(shipmentStatus) ? (previousCompletedAt ?? now) : undefined

// Plants ordered for display: the most valuable line first (unit price ×
// quantity), descending. Returns a copy, so the stored order array is never
// mutated. Used wherever the plant list is shown (orders table + detail page).
export const plantsByValueDesc = (plants: OrderItem[]): OrderItem[] =>
  [...plants].sort((a, b) => b.unitPriceMinor * b.quantity - a.unitPriceMinor * a.quantity)

// Compact per-line label for the orders-table list: the name, plus the quantity
// as ×N only when it is more than 1 (a quantity of 1 is the common case and just
// adds noise).
export const plantLineLabel = (item: OrderItem): string =>
  item.quantity === 1 ? item.name : `${item.name} ×${item.quantity}`

// --- Table column configuration -----------------------------------------
//
// To control the visible fields in one place, columns are described
// declaratively. The table renders ONLY the columns from ORDER_COLUMNS, not
// every Order field. To show/hide a column, edit this array — the Order
// interface stays the full source of truth.
//
// `field: keyof Order` (when used) guarantees we cannot reference a
// non-existent field — TypeScript checks it at compile time. Columns that
// show a derived value (e.g. total) omit `field` and provide `format`.
//
// Modeled as a discriminated union so a column MUST carry exactly one of `field`
// or `format`: a `{ id, header }` with neither (which would render an empty
// cell) is a compile error, and providing both is rejected too (the `never`
// guards). This is the type-level guard the PR #5 review asked for.
interface OrderColumnBase {
  // Stable identity for the React key and column id.
  id: string
  header: string
  // Comparable value the table sorts the column by when its header is clicked.
  // The DISPLAYED value is often derived/formatted (e.g. "13", "1 500,00 ₽", a
  // resolved customer name), so sorting can't use the rendered string — it uses
  // this raw key instead. Omit to make the column non-sortable (e.g. the
  // multi-line plants list has no single meaningful key to order by).
  sortValue?: (order: Order) => string | number
  // Optional width hint (a Tailwind width class, e.g. `w-16`) applied to the
  // column's header and cells in the desktop table, so a few columns can be
  // nudged wider/narrower than their content-driven default. Omit for auto width.
  width?: string
}

// A column backed by a raw Order field (default String() rendering).
interface FieldOrderColumn extends OrderColumnBase {
  field: keyof Order
  format?: never
}

// A derived column whose value comes from a formatter (e.g. the total).
interface FormatOrderColumn extends OrderColumnBase {
  field?: never
  format: (order: Order) => string
}

export type OrderColumn = FieldOrderColumn | FormatOrderColumn

// Canonical option values, in display order. Status/method values keep their
// workflow order (e.g. new → shipped → delivered). Labels are NOT stored here:
// they are resolved per render from the `order` i18n namespace, so the UI follows
// the chosen language (the latin value IS the translation key, so a value can
// never drift apart from its label).
export const PAYMENT_STATUS_VALUES = PAYMENT_STATUS_SCHEMA.options
export const SHIPMENT_STATUS_VALUES = SHIPMENT_STATUS_SCHEMA.options
export const PAYMENT_METHOD_VALUES = PAYMENT_METHOD_SCHEMA.options
export const DELIVERY_METHOD_VALUES = DELIVERY_METHOD_SCHEMA.options

// A translate function bound to the `order` namespace (from
// `useTranslation('order')`). Typed this way so the keys below are checked
// against order.json at compile time, not just at runtime.
type OrderT = TFunction<'order'>

// Translated label for a single status/method value. The latin value IS the
// key's leaf, so the union of values maps to a union of valid keys (type-safe).
export const paymentStatusLabel = (t: OrderT, value: PaymentStatus): string =>
  t(`paymentStatus.${value}`)
export const shipmentStatusLabel = (t: OrderT, value: ShipmentStatus): string =>
  t(`shipmentStatus.${value}`)
export const paymentMethodLabel = (t: OrderT, value: PaymentMethod): string =>
  t(`paymentMethod.${value}`)
export const deliveryMethodLabel = (t: OrderT, value: DeliveryMethod): string =>
  t(`deliveryMethod.${value}`)

// { value, label } option lists for native <select>, built per render in the
// active language. Functions (not constants) because the label is locale-
// dependent; the consuming component re-renders on a language change (via its own
// useTranslation), so the options rebuild with the new labels.
export const paymentStatusOptions = (t: OrderT) =>
  PAYMENT_STATUS_VALUES.map((value) => ({ value, label: paymentStatusLabel(t, value) }))
export const shipmentStatusOptions = (t: OrderT) =>
  SHIPMENT_STATUS_VALUES.map((value) => ({ value, label: shipmentStatusLabel(t, value) }))
export const paymentMethodOptions = (t: OrderT) =>
  PAYMENT_METHOD_VALUES.map((value) => ({ value, label: paymentMethodLabel(t, value) }))
// Delivery methods have no natural order, so sort by the TRANSLATED label (the
// order the user reads), with the "other" catch-all pinned last regardless.
export const deliveryMethodOptions = (t: OrderT) =>
  DELIVERY_METHOD_VALUES.map((value) => ({ value, label: deliveryMethodLabel(t, value) })).sort(
    (a, b) => {
      if (a.value === 'other') return 1
      if (b.value === 'other') return -1
      return a.label.localeCompare(b.label)
    },
  )

// Columns shown in the list table. This is a factory rather than a constant
// because the customer name is NOT stored on the order — it is resolved live
// from the customers collection via `getCustomerName(customerId)`. The caller
// (OrdersPage) loads customers once and passes a lookup, so the table renders
// with two queries instead of N+1 reads. Unknown/deleted customers fall back to
// whatever the lookup returns (e.g. "—"), so a dangling customerId never crashes.
export function buildOrderColumns(
  getCustomerName: (customerId: string) => string,
  t: OrderT,
): OrderColumn[] {
  return [
    {
      id: 'number',
      header: t('columns.number'),
      format: (o) => formatOrderNumber(o.number),
      // Not-yet-numbered (offline) orders are the most recent, so sort them as
      // the highest number rather than 0 — they sit with the newest, not first.
      sortValue: (o) => o.number ?? Number.MAX_SAFE_INTEGER,
      width: 'w-20',
    },
    {
      id: 'dateCreated',
      // Date AND time of creation, on two lines (the date prominent, the time as
      // a muted second line below) — see DataTable's newline-splitting renderer.
      header: t('columns.dateCreated'),
      format: (o) => `${formatDate(o.dateCreated)}\n${formatTime(o.dateCreated)}`,
      // Sort by the raw timestamp, not the formatted strings.
      sortValue: (o) => o.dateCreated,
      width: 'w-32',
    },
    {
      id: 'customer',
      header: t('columns.customer'),
      format: (o) => getCustomerName(o.customerId),
      sortValue: (o) => getCustomerName(o.customerId),
    },
    { id: 'address', header: t('columns.address'), field: 'address', sortValue: (o) => o.address },
    // One plant per line, most valuable first. Rendered richly by DataTable
    // (the name in bold, the quantity as a plain number) keyed off this id —
    // bold-name-plus-quantity can't be expressed as a plain format string.
    // One plant per line (joined by newlines, which the table/card renders as
    // stacked rows), most valuable line first; the quantity shows as ×N only
    // when above 1.
    {
      // A stacked, multi-line list — no single key to sort by, so it stays
      // non-sortable (no sortValue).
      id: 'plants',
      header: t('columns.plants'),
      format: (o) => plantsByValueDesc(o.plants).map(plantLineLabel).join('\n'),
    },
    {
      id: 'total',
      header: t('columns.total'),
      format: (o) => formatMoney(getTotalMinor(o)),
      // Sort by the numeric total (minor units), not the formatted money string.
      sortValue: (o) => getTotalMinor(o),
      width: 'w-32',
    },
    {
      id: 'paymentStatus',
      header: t('columns.paymentStatus'),
      format: (o) => paymentStatusLabel(t, o.paymentStatus),
      // Sort by the displayed label so the order matches what the user reads.
      sortValue: (o) => paymentStatusLabel(t, o.paymentStatus),
      width: 'w-28',
    },
    {
      id: 'shipmentStatus',
      header: t('columns.shipmentStatus'),
      format: (o) => shipmentStatusLabel(t, o.shipmentStatus),
      sortValue: (o) => shipmentStatusLabel(t, o.shipmentStatus),
      width: 'w-28',
    },
  ]
}

// Active filters for the orders list. An empty string in a status field means
// "any"; an empty query matches everything. The price range is in minor units
// (kopecks): `minPriceMinor` defaults to 0 and `maxPriceMinor` is null when
// there is no upper bound (the order total is matched against this range).
export interface OrderFilter {
  query: string
  paymentStatus: PaymentStatus | ''
  shipmentStatus: ShipmentStatus | ''
  minPriceMinor: number
  maxPriceMinor: number | null
}

export const EMPTY_ORDER_FILTER: OrderFilter = {
  query: '',
  paymentStatus: '',
  shipmentStatus: '',
  minPriceMinor: 0,
  maxPriceMinor: null,
}

// True when no filter is active — used to tell "no orders yet" apart from
// "nothing matched the filter".
export const isOrderFilterActive = (filter: OrderFilter): boolean =>
  filter.query.trim() !== '' || isModalFilterActive(filter)

// True when any filter that lives behind the filter dialog is set (payment
// status, shipment status, or the price range). Drives the filter-icon's active
// dot — the inline search query is shown separately and isn't counted here.
export const isModalFilterActive = (filter: OrderFilter): boolean =>
  filter.paymentStatus !== '' ||
  filter.shipmentStatus !== '' ||
  filter.minPriceMinor > 0 ||
  filter.maxPriceMinor !== null

// Filter the orders list in memory (the dataset is small and already loaded, so
// no extra query). `query` matches the order number, the resolved customer name,
// or any plant name, case- and whitespace-insensitive; each set status must
// match exactly; the order total must fall within the price range. The customer
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
    if (filter.shipmentStatus !== '' && o.shipmentStatus !== filter.shipmentStatus) return false
    const total = getTotalMinor(o)
    if (total < filter.minPriceMinor) return false
    if (filter.maxPriceMinor !== null && total > filter.maxPriceMinor) return false
    if (q === '') return true
    const plantNames = o.plants.map((p) => p.name).join(' ')
    // `number ?? ''` so an unsynced order (number null) isn't searchable as the
    // literal "null"; it still matches by customer/plant.
    return `${o.number ?? ''} ${getCustomerName(o.customerId)} ${plantNames}`
      .toLowerCase()
      .includes(q)
  })
}
