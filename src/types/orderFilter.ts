// The orders-list filter: its shape and the in-memory matching engine — split
// out of types/order.ts so the schema module stays about the STORED shape while
// this stays about the LIST UI's querying. Type-only imports from ./order, so
// the re-export there (`export * from './orderFilter'`) creates no runtime cycle.
import type { Currency, Order, OrderStatus, PaymentStatus } from './order'
import { getTotalMinor } from './orderSelectors'

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
