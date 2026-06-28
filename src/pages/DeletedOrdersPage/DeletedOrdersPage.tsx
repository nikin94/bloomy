import { useEffect, useState } from 'react'
import AppHeader from '../../components/AppHeader/AppHeader'
import Spinner from '../../components/Spinner/Spinner'
import Button from '../../components/Button/Button'
import SearchControl from '../../components/SearchControl/SearchControl'
import { fetchDeletedOrders, restoreOrder } from '../../firebase/orders'
import { fetchCustomers } from '../../firebase/customers'
import { useAuth } from '../../context/authContext'
import { formatDate, formatMoney } from '../../utils/format'
import { getTotalMinor, formatOrderNumber, filterOrders, EMPTY_ORDER_FILTER } from '../../types/order'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

// One soft-deleted order in the trash: its number, customer, date and total, with
// a Restore action. Confirming restores the record and the parent drops the row.
// Deleted orders are NOT linked to the detail page — fetchOrder treats them as
// gone, so a row link would only dead-end on "not found"; restore is the one
// action here. Extracted from the map so the loop body is its own component.
const DeletedOrderRow = ({
  order,
  customerName,
  onRestore,
}: {
  order: Order
  customerName: string
  onRestore: (id: string) => void
}) => (
  <li className="flex items-center gap-3 border-b border-border py-3">
    <div className="min-w-0 flex-1">
      <p className="m-0 truncate text-heading">
        Заказ №{formatOrderNumber(order.number)} · {customerName}
      </p>
      <p className="m-0 truncate text-sm text-text">
        {formatDate(order.dateCreated)} · {formatMoney(getTotalMinor(order))}
      </p>
    </div>
    <Button
      variant="secondary"
      size="sm"
      onClick={() => onRestore(order.id)}
      className="shrink-0"
    >
      Восстановить
    </Button>
  </li>
)

// Trash screen: lists the signed-in user's soft-deleted orders and lets each be
// restored back into the active list. Reached from the "Корзина" nav link. The
// customer name is resolved the same way the orders list does — load customers
// once (including deleted ones) and look the name up in memory.
const DeletedOrdersPage = () => {
  // Guaranteed non-null under ProtectedRoute, but read defensively and gate on it.
  const { user } = useAuth()
  const ownerId = user?.uid
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  // A load failure means there is no list to show, so it replaces the content.
  const [loadError, setLoadError] = useState<string | null>(null)
  // Inline search over the trash (order number / customer name).
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!ownerId) return
    let active = true
    // `includeDeleted` so an order whose customer was also soft-deleted still
    // resolves the name instead of falling back to "—".
    Promise.all([fetchDeletedOrders(ownerId), fetchCustomers(ownerId, { includeDeleted: true })])
      .then(([orderData, customerData]) => {
        if (!active) return
        setOrders(orderData)
        setCustomers(customerData)
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить корзину')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [ownerId])

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]))
  const getCustomerName = (id: string) => customerNameById.get(id) ?? '—'

  // Restore is fire-and-forget (offline-safe): drop the row optimistically and
  // the order returns to the active list; a failed write is reported to Sentry.
  const handleRestore = (id: string) => {
    restoreOrder(id)
    setOrders((prev) => prev.filter((o) => o.id !== id))
  }

  // Reuse the orders predicate with a query-only filter (status/price are empty
  // in EMPTY_ORDER_FILTER, so it matches purely by number / customer / plants) —
  // the same matching as the main list, no extra logic.
  const visibleOrders = filterOrders(orders, { ...EMPTY_ORDER_FILTER, query }, getCustomerName)
  const searchActive = query.trim() !== ''

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        actions={<SearchControl value={query} onChange={setQuery} label="Поиск в корзине" />}
      />

      {/* Flex column so the empty state can center itself (m-auto) in the whole
          available area, while the list keeps its constrained max-w-2xl column. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
        {loading && <Spinner />}
        {loadError && <p className="mx-auto m-0 w-full max-w-2xl text-danger">{loadError}</p>}

        {!loading &&
          !loadError &&
          (visibleOrders.length === 0 ? (
            // m-auto in a flex container centers on both axes.
            <p className="m-auto text-text">{searchActive ? 'Ничего не найдено' : 'Корзина пуста'}</p>
          ) : (
            <ul className="mx-auto m-0 w-full max-w-2xl list-none p-0">
              {visibleOrders.map((order) => (
                <DeletedOrderRow
                  key={order.id}
                  order={order}
                  customerName={getCustomerName(order.customerId)}
                  onRestore={handleRestore}
                />
              ))}
            </ul>
          ))}
      </div>
    </div>
  )
}

export default DeletedOrdersPage
