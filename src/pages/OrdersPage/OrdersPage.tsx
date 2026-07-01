import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import DataTable from '../../components/DataTable/DataTable'
import Spinner from '../../components/Spinner/Spinner'
import SearchControl from '../../components/SearchControl/SearchControl'
import OrderFilterControl from '../../components/OrderFilterControl/OrderFilterControl'
import { fetchOrders, reconcileOrderNumbers } from '../../firebase/orders'
import { fetchCustomers } from '../../firebase/customers'
import { useAuth } from '../../context/authContext'
import { useHeaderActions } from '../../context/headerActionsContext'
import {
  buildOrderColumns,
  filterOrders,
  isOrderFilterActive,
  EMPTY_ORDER_FILTER,
} from '../../types/order'
import type { Order, OrderFilter } from '../../types/order'
import type { Customer } from '../../types/customer'

const OrdersPage = () => {
  const { t } = useTranslation(['order', 'common'])
  // Order-bound t for the column/option helpers, which are typed TFunction<'order'>.
  const { t: tOrder } = useTranslation('order')
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
  // Navigation state, set by another screen:
  //  • highlightId — NewOrderPage, after a create, to flash the new row.
  //  • dateFilter — the statistics tab, when a monthly-chart bar is clicked, to
  //    open this list scoped to that month.
  // Both are read once into state, then stripped from history so a refresh or
  // back-nav doesn't replay them.
  const navState =
    (location.state as {
      highlightId?: string
      dateFilter?: { minDate: number | null; maxDate: number | null }
    } | null) ?? null
  const [filter, setFilter] = useState<OrderFilter>(() =>
    navState?.dateFilter
      ? { ...EMPTY_ORDER_FILTER, minDate: navState.dateFilter.minDate, maxDate: navState.dateFilter.maxDate }
      : EMPTY_ORDER_FILTER,
  )
  // Captured once on mount so it survives the history cleanup below (which sets
  // location.state to null); the row keeps highlighting through its animation.
  const [highlightOrderId] = useState(navState?.highlightId)
  useEffect(() => {
    if (navState?.highlightId || navState?.dateFilter) {
      navigate('.', { replace: true, state: null })
    }
    // Only on first mount: consume the navigation state exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!ownerId) return
    let active = true

    // Load and render the list FIRST, straight from the cache — never gated on
    // reconcileOrderNumbers. Offline, the numbering transaction never settles
    // (it needs the server), so gating the render on it would hang the spinner
    // forever. Two queries (orders + customers) instead of N+1: customers are
    // loaded once and the table resolves each order's name in memory.
    // `includeDeleted` so an order whose customer was soft-deleted still shows
    // the name, not "—".
    const load = () =>
      Promise.all([fetchOrders(ownerId), fetchCustomers(ownerId, { includeDeleted: true })])
        .then(([orderData, customerData]) => {
          if (!active) return
          setOrders(orderData)
          setCustomers(customerData)
        })
        .catch((err: unknown) => {
          if (active) setError(err instanceof Error ? err.message : t('list.loadError'))
        })

    load().finally(() => {
      if (active) setLoading(false)
    })

    // In the BACKGROUND, assign real numbers to any orders created offline. This
    // runs online (its transaction is best-effort offline — it just stays pending
    // and is retried next time, never blocking the list). When it numbers
    // something, reload so the freshly-assigned № replaces the "—" live.
    const reconcile = () => {
      reconcileOrderNumbers(ownerId)
        .then((numbered) => {
          if (active && numbered) return load()
        })
        .catch(() => {
          // Offline / Firebase unreachable: leave the list as-is, retry later.
        })
    }
    reconcile()

    // Coming back online retries the numbering and reloads, so an order created
    // offline gets its № (and the list refreshes) without a manual page reload.
    window.addEventListener('online', reconcile)
    return () => {
      active = false
      window.removeEventListener('online', reconcile)
    }
    // `t` is only read in the error fallback; depending on it would refetch on a
    // language switch, so it's intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId])

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]))
  const getCustomerName = (id: string) => customerNameById.get(id) ?? '—'
  const columns = buildOrderColumns(getCustomerName, tOrder)

  // Filtering is in memory: the whole list is already loaded, the dataset is
  // small, and it keeps search instant with no extra reads.
  const visibleOrders = filterOrders(orders, filter, getCustomerName)
  const filterActive = isOrderFilterActive(filter)

  // Search + filter controls live in the header (next to settings). Search is an
  // expanding loupe; the funnel opens the shared status/currency/price dialog.
  // Published into the global header via the action slot; memoised so its
  // identity only changes with the state it depends on (see useHeaderActions).
  const headerActions = useMemo(
    () => (
      <>
        <SearchControl
          value={filter.query}
          onChange={(query) => setFilter((f) => ({ ...f, query }))}
          label={t('list.search')}
        />
        <OrderFilterControl orders={orders} filter={filter} onChange={setFilter} />
      </>
    ),
    [filter, orders, t],
  )
  useHeaderActions(headerActions)

  return (
    <>
      {loading && <Spinner />}
      {error && <p className="px-6 py-8 text-danger">{error}</p>}

      {!loading && !error && (
        <DataTable
          orders={visibleOrders}
          columns={columns}
          onRowClick={(order) => navigate(`/orders/${order.id}`)}
          highlightOrderId={highlightOrderId}
          emptyMessage={filterActive ? t('common:nothingFound') : t('list.empty')}
        />
      )}
    </>
  )
}

export default OrdersPage
