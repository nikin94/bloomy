import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import DataTable from '@/components/DataTable/DataTable'
import Spinner from '@/components/Spinner/Spinner'
import SearchControl from '@/components/SearchControl/SearchControl'
import OrderFilterControl from '@/components/OrderFilterControl/OrderFilterControl'
import { useDeletedOrders, EMPTY_ORDERS } from '@/queries/orders'
import { useCustomers, EMPTY_CUSTOMERS } from '@/queries/customers'
import { useAuth } from '@/context/authContext'
import { useHeaderActions } from '@/context/headerActionsContext'
import {
  filterOrders,
  isOrderFilterActive,
  trashDaysLeft,
  EMPTY_ORDER_FILTER,
} from '@/types/order'
import type { OrderFilter } from '@/types/order'
import { buildOrderColumns } from '@/components/DataTable/orderColumns'
import type { OrderColumn, OrderSort } from '@/components/DataTable/orderColumns'
import { buildCustomerNameResolver } from '@/types/customer'

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
  // Trash orders + customers (WITH deleted, so an order whose customer was also
  // soft-deleted still resolves the name instead of "—") come from the shared query
  // cache. Stable EMPTY_* fallbacks so the loading-phase identity doesn't loop the
  // header-actions memo (see EMPTY_ORDERS).
  const trashQuery = useDeletedOrders(ownerId)
  const customersQuery = useCustomers(ownerId, { includeDeleted: true })
  const orders = trashQuery.data ?? EMPTY_ORDERS
  const customers = customersQuery.data ?? EMPTY_CUSTOMERS
  const loading = trashQuery.isLoading || customersQuery.isLoading
  const loadError = trashQuery.error ?? customersQuery.error
  // Search + status/currency/price filter over the trash — the same OrderFilter
  // shape as the main list, so the trash filters exactly like the active list.
  const [filter, setFilter] = useState<OrderFilter>(EMPTY_ORDER_FILTER)
  // List sort, lifted so the DataTable headers and the filter dialog's sort
  // control drive the same order (phones have no headers) — as on the active list.
  const [sort, setSort] = useState<OrderSort | null>(null)
  // "Now" for the purge countdown, captured once on mount (see purgeColumn below).
  const [now] = useState(() => Date.now())

  // Memoised so their identity is stable across renders: `columns` now feeds the
  // header-actions node (its memo would loop setActions on a fresh array every
  // render — see useHeaderActions), and DataTable keys its column-def memo off it.
  const getCustomerName = useMemo(() => buildCustomerNameResolver(customers), [customers])
  // The active-list columns plus a trash-only "auto-purge countdown" so the user
  // sees, per order, how long until it is permanently deleted. `now` is captured
  // once on mount (day-granularity, so it needn't be reactive — and a render-time
  // Date.now() isn't pure). Uses the page's multi-namespace `t` (the column built
  // inside buildOrderColumns is bound to `order` and couldn't reach `common:days`).
  const columns = useMemo(() => {
    const purgeColumn: OrderColumn = {
      id: 'purgeCountdown',
      header: t('trash.purgeColumn'),
      format: (o) => {
        const days = trashDaysLeft(o, now)
        return days === null ? '—' : t('common:days', { count: days })
      },
      // Sort soonest-to-purge first; a legacy delete with no countdown sorts last.
      sortValue: (o) => trashDaysLeft(o, now) ?? Number.MAX_SAFE_INTEGER,
      width: 'w-32',
    }
    return [...buildOrderColumns(getCustomerName, tOrder), purgeColumn]
  }, [getCustomerName, tOrder, t, now])

  // Reuse the orders predicate — the trash filters exactly like the active list
  // (search + status/currency/price), no extra logic.
  const visibleOrders = filterOrders(orders, filter, getCustomerName)
  const filterActive = isOrderFilterActive(filter)

  // Search + filter live in the global header; published via the action slot
  // (memoised so identity only changes with the state — see useHeaderActions).
  const headerActions = useMemo(
    () => (
      <>
        <SearchControl
          value={filter.query}
          onChange={(query) => setFilter((f) => ({ ...f, query }))}
          label={t('trash.search')}
        />
        <OrderFilterControl
          orders={orders}
          filter={filter}
          onChange={setFilter}
          columns={columns}
          sort={sort}
          onSortChange={setSort}
        />
      </>
    ),
    [filter, orders, t, columns, sort],
  )
  useHeaderActions(headerActions)

  return (
    <>
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
      {loadError && (
        <p className="px-6 py-8 text-danger">{loadError.message || t('trash.loadError')}</p>
      )}

      {!loading && !loadError && (
        <DataTable
          orders={visibleOrders}
          columns={columns}
          onRowClick={(order) => navigate(`/orders/${order.id}`)}
          emptyMessage={filterActive ? t('common:nothingFound') : t('trash.empty')}
          sort={sort}
          onSortChange={setSort}
        />
      )}
    </>
  )
}

export default DeletedOrdersPage
