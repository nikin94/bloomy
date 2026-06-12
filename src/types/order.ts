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
export interface OrderItem {
  name: string
  quantity: number
  price: number
}

// A single order for potted plants and flowers = one table row.
// Fields are taken from order-list-thead.php (nikin94/flowers repository).
// The exact schema is still being finalized, so some fields are optional.
export interface Order {
  id: string
  dateCreated: number // timestamp (ms)
  customerName: string
  address: string
  plants: OrderItem[]
  paymentMethod: PaymentMethod
  plantsPrice: number
  deliveryPrice: number
  totalPrice: number
  paymentStatus: PaymentStatus
  shipmentStatus: ShipmentStatus
  comment?: string
}

// --- Table column configuration -----------------------------------------
//
// To control the visible fields in one place, columns are described
// declaratively. The table renders ONLY the columns from ORDER_COLUMNS, not
// every Order field. To show/hide a field, edit this array — the Order
// interface stays the full source of truth.
//
// `key: keyof Order` guarantees we cannot reference a non-existent field —
// TypeScript checks it at compile time.

export interface OrderColumn {
  key: keyof Order
  header: string
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

// Subset of Order fields shown in the list table.
export const ORDER_COLUMNS: OrderColumn[] = [
  { key: 'id', header: '№' },
  { key: 'dateCreated', header: 'Дата', format: (o) => formatDate(o.dateCreated) },
  { key: 'customerName', header: 'Заказчик' },
  { key: 'address', header: 'Адрес' },
  { key: 'plants', header: 'Растения', format: (o) => o.plants.map((p) => p.name).join(', ') },
  { key: 'totalPrice', header: 'Сумма', format: (o) => formatMoney(o.totalPrice) },
  { key: 'paymentStatus', header: 'Оплата', format: (o) => PAYMENT_STATUS_LABELS[o.paymentStatus] },
  {
    key: 'shipmentStatus',
    header: 'Отправка',
    format: (o) => SHIPMENT_STATUS_LABELS[o.shipmentStatus],
  },
]
