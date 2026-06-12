import { formatDate, formatMoney } from '../lib/format'

// Order payment status.
// Use union types instead of enum: tsconfig enables erasableSyntaxOnly,
// which forbids enums (they are not "erased" from the runtime).
export type PaymentStatus = 'pending' | 'paid' | 'refunded'

// Parcel shipment status.
export type ShipmentStatus = 'new' | 'packing' | 'shipped' | 'delivered' | 'cancelled'

// Payment method.
export type PaymentMethod = 'cash' | 'card' | 'bank'

// A single line item in an order — a plant/flower.
// Starts as plain text (the plant name); saved together with quantity and a
// unit price. Amounts are integers in minor units (kopecks) to avoid float
// rounding errors; the unit price is a snapshot taken at order time.
export interface OrderItem {
  name: string
  quantity: number
  unitPriceMinor: number
}

// A single order for potted plants and flowers = one table row.
// Fields are taken from order-list-thead.php (nikin94/flowers repository).
// The exact schema is still being finalized, so some fields are optional.
//
// Money model: items are the source of truth. Subtotal and total are NOT
// stored — they are derived from the items (see getSubtotalMinor/getTotalMinor).
// Only delivery is an independent input and is stored. This keeps the order a
// live "notebook": editing items recomputes the totals, no stale snapshot.
export interface Order {
  id: string
  dateCreated: number // timestamp (ms)
  customerName: string
  address: string
  plants: OrderItem[]
  paymentMethod: PaymentMethod
  deliveryPriceMinor: number // minor units (kopecks)
  currency: 'RUB'
  paymentStatus: PaymentStatus
  shipmentStatus: ShipmentStatus
  comment?: string
}

// Derived money selectors. All amounts are integers in minor units (kopecks).
// Subtotal = sum of item line totals; total = subtotal + delivery.
export const getSubtotalMinor = (order: Order): number =>
  order.plants.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0)

export const getTotalMinor = (order: Order): number =>
  getSubtotalMinor(order) + order.deliveryPriceMinor

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

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Ожидает',
  paid: 'Оплачен',
  refunded: 'Возврат',
}

const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  new: 'Новый',
  packing: 'Сборка',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
}

// Subset of Order data shown in the list table.
export const ORDER_COLUMNS: OrderColumn[] = [
  { id: 'id', header: '№', field: 'id' },
  { id: 'dateCreated', header: 'Дата', format: (o) => formatDate(o.dateCreated) },
  { id: 'customerName', header: 'Заказчик', field: 'customerName' },
  { id: 'address', header: 'Адрес', field: 'address' },
  { id: 'plants', header: 'Растения', format: (o) => o.plants.map((p) => p.name).join(', ') },
  { id: 'total', header: 'Сумма', format: (o) => formatMoney(getTotalMinor(o)) },
  { id: 'paymentStatus', header: 'Оплата', format: (o) => PAYMENT_STATUS_LABELS[o.paymentStatus] },
  {
    id: 'shipmentStatus',
    header: 'Отправка',
    format: (o) => SHIPMENT_STATUS_LABELS[o.shipmentStatus],
  },
]
