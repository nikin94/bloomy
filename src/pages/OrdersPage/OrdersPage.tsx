import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import DataTable from '@/components/DataTable/DataTable'
import SearchControl from '@/components/SearchControl/SearchControl'
import OrderFilterControl from '@/components/OrderFilterControl/OrderFilterControl'
import { useOrdersSuspense, useReconcileOrderNumbers } from '@/queries/orders'
import { useCustomersSuspense } from '@/queries/customers'
import { useRequiredOwnerId } from '@/hooks/useOwnerId'
import { useConsumeNavState } from '@/hooks/useConsumeNavState'
import { useHeaderActions } from '@/context/headerActionsContext'
import {
  filterOrders,
  isOrderFilterActive,
  EMPTY_ORDER_FILTER,
} from '@/types/order'
import type { OrderFilter } from '@/types/order'
import { buildOrderColumns } from '@/components/DataTable/orderColumns'
import type { OrderSort } from '@/components/DataTable/orderColumns'
import { buildCustomerNameResolver } from '@/types/customer'

const OrdersPage = () => {
  const { t } = useTranslation(['order', 'common'])
  // Order-bound t for the column/option helpers, which are typed TFunction<'order'>.
  const { t: tOrder } = useTranslation('order')
  const navigate = useNavigate()
  const ownerId = useRequiredOwnerId()
  // Orders + customers (WITH deleted, so a removed customer's name still resolves)
  // come from the shared query cache; navigating away and back reuses the parsed
  // lists instead of re-querying + re-parsing. Both suspend to the route-level
  // Spinner (AppLayout) until resolved and throw a load failure to the route error
  // boundary there, so this page has no loading/error branch of its own. Two
  // useSuspenseQuery calls do NOT waterfall — both fire on first render.
  const { data: orders } = useOrdersSuspense(ownerId)
  const { data: customers } = useCustomersSuspense(ownerId, { includeDeleted: true })
  // Background: assign real numbers to any orders created offline, then invalidate
  // the list so the freshly-numbered rows refetch (runs on mount + on reconnect).
  useReconcileOrderNumbers(ownerId)
  // List sort, lifted here so BOTH the DataTable headers (desktop) and the filter
  // dialog's sort control (phones, no headers) drive the same order. Ephemeral —
  // resets to the natural order on remount, matching the old header-only sort.
  const [sort, setSort] = useState<OrderSort | null>(null)
  // Navigation state, set by another screen and consumed once (read on mount,
  // then stripped from history so a refresh or back-nav doesn't replay it):
  //  • highlightId — NewOrderPage, after a create, to flash the new row.
  //  • dateFilter — the statistics tab, when a monthly-chart bar is clicked, to
  //    open this list scoped to that month.
  const navState = useConsumeNavState<{
    highlightId?: string
    dateFilter?: { minDate: number | null; maxDate: number | null }
  }>()
  const [filter, setFilter] = useState<OrderFilter>(() =>
    navState?.dateFilter
      ? { ...EMPTY_ORDER_FILTER, minDate: navState.dateFilter.minDate, maxDate: navState.dateFilter.maxDate }
      : EMPTY_ORDER_FILTER,
  )
  // navState is itself captured once on mount, so the highlight id survives the
  // history cleanup and the row keeps highlighting through its animation.
  const highlightOrderId = navState?.highlightId

  // Memoised so their identity is stable across renders: `columns` now feeds the
  // header-actions node (its memo would loop setActions on a fresh array every
  // render — see useHeaderActions), and DataTable keys its column-def memo off it.
  const getCustomerName = useMemo(() => buildCustomerNameResolver(customers), [customers])
  const columns = useMemo(() => buildOrderColumns(getCustomerName, tOrder), [getCustomerName, tOrder])

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
    <DataTable
      orders={visibleOrders}
      columns={columns}
      onRowClick={(order) => navigate(`/orders/${order.id}`)}
      highlightOrderId={highlightOrderId}
      emptyMessage={filterActive ? t('common:nothingFound') : t('list.empty')}
      sort={sort}
      onSortChange={setSort}
    />
  )
}

export default OrdersPage
