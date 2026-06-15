import { z } from 'zod'
import { formatDate, formatMoney } from '../utils/format'

// Status/method unions are defined as Zod enums so the runtime validator (used
// when reading Firestore documents) and the TypeScript types share a single
// source of truth. We still avoid `enum` — tsconfig enables erasableSyntaxOnly,
// which forbids it; the inferred string-literal unions are erasable.
export const PAYMENT_STATUS_SCHEMA = z.enum(['pending', 'paid', 'refunded'])
export type PaymentStatus = z.infer<typeof PAYMENT_STATUS_SCHEMA>

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
// Russian labels live in DELIVERY_METHOD_LABELS and the display order is set in
// DELIVERY_METHOD_OPTIONS (alphabetical, with the "other" catch-all pinned last).
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
  number: z.number().int().positive(), // per-owner sequential number, assigned on create
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
})

// A single order for potted plants and flowers = one table row. The doc id is
// added to the stored shape.
export type Order = z.infer<typeof STORED_ORDER_SCHEMA> & { id: string }

// Derived money selectors. All amounts are integers in minor units (kopecks).
// Subtotal = sum of item line totals; total = subtotal + delivery.
export const getSubtotalMinor = (order: Order): number =>
  order.plants.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0)

export const getTotalMinor = (order: Order): number =>
  getSubtotalMinor(order) + order.deliveryPriceMinor

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

export interface OrderColumn {
  // Stable identity for the React key and column id.
  id: string
  header: string
  // Raw Order field for default cell rendering. Omit for derived columns.
  field?: keyof Order
  // Optional formatting of the cell value into a display string.
  format?: (order: Order) => string
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Ожидает',
  paid: 'Оплачен',
  refunded: 'Возврат',
}

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  new: 'Новый',
  packing: 'Сборка',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Наличные',
  card: 'Карта',
  bank: 'Перевод',
}

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  bus: 'Автобус',
  post: 'Почта',
  pickup: 'Самовывоз',
  cdek: 'СДЭК',
  taxi: 'Такси',
  other: 'Другое',
}

// Build typed { value, label } options from a label record for native <select>.
// Keys originate from a Record<Union, string>, so casting them back to the
// union is safe.
function toOptions<K extends string>(labels: Record<K, string>): { value: K; label: string }[] {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }))
}

export const PAYMENT_STATUS_OPTIONS = toOptions(PAYMENT_STATUS_LABELS)
export const SHIPMENT_STATUS_OPTIONS = toOptions(SHIPMENT_STATUS_LABELS)
export const PAYMENT_METHOD_OPTIONS = toOptions(PAYMENT_METHOD_LABELS)
// Status/method selects above keep their workflow order (e.g. new → packing →
// shipped), so toOptions preserves insertion order by design. Delivery methods
// have no natural order, so sort them alphabetically in code rather than relying
// on the order of keys in the label literal. The "other" catch-all is pinned
// last, after the alphabetical names, regardless of its label.
export const DELIVERY_METHOD_OPTIONS = toOptions(DELIVERY_METHOD_LABELS).sort((a, b) => {
  if (a.value === 'other') return 1
  if (b.value === 'other') return -1
  return a.label.localeCompare(b.label, 'ru')
})

// Columns shown in the list table. This is a factory rather than a constant
// because the customer name is NOT stored on the order — it is resolved live
// from the customers collection via `getCustomerName(customerId)`. The caller
// (OrdersPage) loads customers once and passes a lookup, so the table renders
// with two queries instead of N+1 reads. Unknown/deleted customers fall back to
// whatever the lookup returns (e.g. "—"), so a dangling customerId never crashes.
export function buildOrderColumns(
  getCustomerName: (customerId: string) => string,
): OrderColumn[] {
  return [
    { id: 'number', header: '№', format: (o) => String(o.number) },
    { id: 'dateCreated', header: 'Дата', format: (o) => formatDate(o.dateCreated) },
    { id: 'customer', header: 'Клиент', format: (o) => getCustomerName(o.customerId) },
    { id: 'address', header: 'Адрес', field: 'address' },
    // One plant per line, most valuable first. Rendered richly by DataTable
    // (the name in bold, the quantity as a plain number) keyed off this id —
    // bold-name-plus-quantity can't be expressed as a plain format string.
    // One plant per line (joined by newlines, which the table/card renders as
    // stacked rows), most valuable line first; the quantity shows as ×N only
    // when above 1.
    {
      id: 'plants',
      header: 'Растения',
      format: (o) => plantsByValueDesc(o.plants).map(plantLineLabel).join('\n'),
    },
    { id: 'total', header: 'Сумма', format: (o) => formatMoney(getTotalMinor(o)) },
    { id: 'paymentStatus', header: 'Оплата', format: (o) => PAYMENT_STATUS_LABELS[o.paymentStatus] },
    {
      id: 'shipmentStatus',
      header: 'Отправка',
      format: (o) => SHIPMENT_STATUS_LABELS[o.shipmentStatus],
    },
  ]
}
