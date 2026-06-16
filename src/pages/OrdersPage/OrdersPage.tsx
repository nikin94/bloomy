import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AppHeader from '../../components/AppHeader/AppHeader'
import DataTable from '../../components/DataTable/DataTable'
import Spinner from '../../components/Spinner/Spinner'
import Input from '../../components/Input/Input'
import Select from '../../components/Select/Select'
import { fetchOrders } from '../../firebase/orders'
import { fetchCustomers } from '../../firebase/customers'
import { useAuth } from '../../context/authContext'
import {
  buildOrderColumns,
  filterOrders,
  isOrderFilterActive,
  EMPTY_ORDER_FILTER,
  PAYMENT_STATUS_OPTIONS,
  SHIPMENT_STATUS_OPTIONS,
} from '../../types/order'
import type { Order, OrderFilter, PaymentStatus, ShipmentStatus } from '../../types/order'
import type { Customer } from '../../types/customer'

const OrdersPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  // Guaranteed non-null here (rendered under ProtectedRoute), but typed as
  // optional, so we read the uid defensively and gate the fetch on it.
  const { user } = useAuth()
  const ownerId = user?.uid
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<OrderFilter>(EMPTY_ORDER_FILTER)

  // Set by NewOrderPage after a successful create, to highlight the new order.
  // Read once into state, then strip it from history so a refresh or back-nav
  // doesn't replay the highlight.
  const highlightState = (location.state as { highlightId?: string } | null) ?? null
  // Captured once on mount so it survives the history cleanup below (which sets
  // location.state to null); the row keeps highlighting through its animation.
  const [highlightOrderId] = useState(highlightState?.highlightId)
  useEffect(() => {
    if (highlightState?.highlightId) {
      navigate('.', { replace: true, state: null })
    }
    // Only on first mount: consume the navigation state exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!ownerId) return
    let active = true
    // Two queries (orders + customers) instead of N+1: customers are loaded
    // once and the table resolves each order's name from this list in memory.
    // `includeDeleted` so an order whose customer was soft-deleted still shows
    // the name in the list, not "—".
    Promise.all([fetchOrders(ownerId), fetchCustomers(ownerId, { includeDeleted: true })])
      .then(([orderData, customerData]) => {
        if (!active) return
        setOrders(orderData)
        setCustomers(customerData)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Не удалось загрузить заказы')
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
  const columns = buildOrderColumns(getCustomerName)

  // Filtering is in memory: the whole list is already loaded, the dataset is
  // small, and it keeps search instant with no extra reads.
  const visibleOrders = filterOrders(orders, filter, getCustomerName)
  const filterActive = isOrderFilterActive(filter)

  return (
    <div className="flex h-full flex-col">
      <AppHeader />

      {loading && <Spinner />}
      {error && <p className="px-6 py-8 text-danger">{error}</p>}

      {!loading && !error && (
        <>
          {/* Filter bar: search by number/customer + status filters. Stacks on
              narrow screens, sits inline from sm up. */}
          <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center">
            <Input
              type="search"
              className="w-full sm:max-w-xs"
              placeholder="Поиск по номеру или клиенту"
              aria-label="Поиск заказов"
              value={filter.query}
              onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
            />
            <Select
              aria-label="Фильтр по статусу оплаты"
              className="sm:w-44"
              value={filter.paymentStatus}
              onChange={(e) =>
                setFilter((f) => ({ ...f, paymentStatus: e.target.value as PaymentStatus | '' }))
              }
            >
              <option value="">Оплата: все</option>
              {PAYMENT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Фильтр по статусу отправки"
              className="sm:w-44"
              value={filter.shipmentStatus}
              onChange={(e) =>
                setFilter((f) => ({ ...f, shipmentStatus: e.target.value as ShipmentStatus | '' }))
              }
            >
              <option value="">Отправка: все</option>
              {SHIPMENT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          <DataTable
            orders={visibleOrders}
            columns={columns}
            onRowClick={(order) => navigate(`/orders/${order.id}`)}
            highlightOrderId={highlightOrderId}
            emptyMessage={filterActive ? 'Ничего не найдено' : 'Заказов пока нет'}
          />
        </>
      )}
    </div>
  )
}

export default OrdersPage
