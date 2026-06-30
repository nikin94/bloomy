import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../../components/AppHeader/AppHeader'
import DataTable from '../../components/DataTable/DataTable'
import Spinner from '../../components/Spinner/Spinner'
import SearchControl from '../../components/SearchControl/SearchControl'
import OrderFilterControl from '../../components/OrderFilterControl/OrderFilterControl'
import { fetchDeletedOrders } from '../../firebase/orders'
import { fetchCustomers } from '../../firebase/customers'
import { useAuth } from '../../context/authContext'
import {
  buildOrderColumns,
  filterOrders,
  isOrderFilterActive,
  EMPTY_ORDER_FILTER,
} from '../../types/order'
import type { Order, OrderFilter } from '../../types/order'
import type { Customer } from '../../types/customer'

// Trash screen: the signed-in user's soft-deleted orders, shown in the SAME
// table/card layout as the active list (DataTable) so it reads identically. Two
// things keep it from being confused with the active list: a fixed "these are
// deleted" banner, and that restoring happens on the order's own detail page
// (open a row → Restore) rather than inline. The customer name is resolved the
// way the orders list does — load customers once (including deleted ones) and
// look the name up in memory.
const DeletedOrdersPage = () => {
  const { t } = useTranslation(['order', 'common'])
  // Order-bound t for the column helpers (typed TFunction<'order'>).
  const { t: tOrder } = useTranslation('order')
  const navigate = useNavigate()
  // Guaranteed non-null under ProtectedRoute, but read defensively and gate on it.
  const { user } = useAuth()
  const ownerId = user?.uid
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  // A load failure means there is no list to show, so it replaces the content.
  const [loadError, setLoadError] = useState<string | null>(null)
  // Search + status/currency/price filter over the trash — the same OrderFilter
  // shape as the main list, so the trash filters exactly like the active list.
  const [filter, setFilter] = useState<OrderFilter>(EMPTY_ORDER_FILTER)

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
        if (active) setLoadError(err instanceof Error ? err.message : t('trash.loadError'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // `t` is only read in the error fallback; depending on it would refetch on a
    // language switch, so it's intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId])

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]))
  const getCustomerName = (id: string) => customerNameById.get(id) ?? '—'
  const columns = buildOrderColumns(getCustomerName, tOrder)

  // Reuse the orders predicate — the trash filters exactly like the active list
  // (search + status/currency/price), no extra logic.
  const visibleOrders = filterOrders(orders, filter, getCustomerName)
  const filterActive = isOrderFilterActive(filter)

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        actions={
          <>
            <SearchControl
              value={filter.query}
              onChange={(query) => setFilter((f) => ({ ...f, query }))}
              label={t('trash.search')}
            />
            <OrderFilterControl orders={orders} filter={filter} onChange={setFilter} />
          </>
        }
      />

      {/* Fixed banner labelling the page as the trash, so the identical table
          layout is never mistaken for the active orders list. Shown only once
          there is something in the trash (an empty trash gets its own message
          from the table below). */}
      {!loading && !loadError && orders.length > 0 && (
        <div
          role="status"
          className="border-b border-border bg-danger-bg px-6 py-2 text-center text-sm font-medium text-danger"
        >
          {t('trash.banner')}
        </div>
      )}

      {loading && <Spinner />}
      {loadError && <p className="px-6 py-8 text-danger">{loadError}</p>}

      {!loading && !loadError && (
        <DataTable
          orders={visibleOrders}
          columns={columns}
          onRowClick={(order) => navigate(`/orders/${order.id}`)}
          emptyMessage={filterActive ? t('common:nothingFound') : t('trash.empty')}
        />
      )}
    </div>
  )
}

export default DeletedOrdersPage
