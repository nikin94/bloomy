import { formatDate, formatMoney } from '../lib/format'

// Статус оплаты заказа.
// Используем union-типы вместо enum: в tsconfig включён erasableSyntaxOnly,
// при котором enumّ запрещены (они не "стираются" из рантайма).
export type PaymentStatus = 'pending' | 'paid' | 'refunded'

// Статус отправки посылки.
export type ShipmentStatus = 'new' | 'packing' | 'shipped' | 'delivered' | 'cancelled'

// Способ оплаты.
export type PaymentMethod = 'cash' | 'card' | 'bank'

// Одна позиция в заказе — растение/цветок.
export interface OrderItem {
  name: string
  quantity: number
  price: number
}

// Один заказ на горшочные растения и цветы = одна строка таблицы.
// Поля взяты из order-list-thead.php (репозиторий nikin94/flowers).
// Точная схема ещё уточняется, поэтому часть полей опциональна.
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

// --- Конфигурация колонок таблицы ---------------------------------------
//
// Чтобы управлять отображаемыми полями в одном месте, описываем колонки
// декларативно. В таблице рендерятся ТОЛЬКО колонки из ORDER_COLUMNS, а не
// все поля Order. Хотим показать/скрыть поле — правим этот массив, интерфейс
// Order при этом остаётся полным источником правды.
//
// `key: keyof Order` гарантирует, что мы не сможем сослаться на несуществующее
// поле — TypeScript проверит это на этапе компиляции.

export interface OrderColumn {
  key: keyof Order
  header: string
  // Опциональное форматирование значения ячейки в строку для отображения.
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

// Подмножество полей Order, которые показываем в таблице-списке.
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
