import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import DataTable from '@/components/DataTable/DataTable'
import SearchControl from '@/components/SearchControl/SearchControl'
import OrderFilterControl from '@/components/OrderFilterControl/OrderFilterControl'
import Button from '@/components/Button/Button'
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal'
import { hardDeleteOrders } from '@/firebase/orders'
import { useDeletedOrdersSuspense, useOrderCache } from '@/queries/orders'
import { useCustomersSuspense } from '@/queries/customers'
import { useRequiredOwnerId } from '@/hooks/useOwnerId'
import { useHeaderActions } from '@/context/headerActionsContext'
import { filterOrders, isOrderFilterActive, EMPTY_ORDER_FILTER } from '@/types/order'
import type { OrderFilter } from '@/types/order'
import { SCREEN_GUTTER_X } from '@/styles/screenStyles'
import { buildOrderColumns } from '@/components/DataTable/orderColumns'
import type { OrderSort } from '@/components/DataTable/orderColumns'
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
  const ownerId = useRequiredOwnerId()
  // Trash orders + customers (WITH deleted, so an order whose customer was also
  // soft-deleted still resolves the name instead of "—") come from the shared query
  // cache; both suspend to the route-level Spinner (AppLayout) until resolved and
  // throw a load failure to the route error boundary there, so this page carries no
  // loading/error branch.
  const { data: orders } = useDeletedOrdersSuspense(ownerId)
  const { data: customers } = useCustomersSuspense(ownerId, { includeDeleted: true })
  // Search + status/currency/price filter over the trash — the same OrderFilter
  // shape as the main list, so the trash filters exactly like the active list.
  const [filter, setFilter] = useState<OrderFilter>(EMPTY_ORDER_FILTER)
  // List sort, lifted so the DataTable headers and the filter dialog's sort
  // control drive the same order (phones have no headers) — as on the active list.
  const [sort, setSort] = useState<OrderSort | null>(null)
  // "Empty trash" is confirmed in a modal — it PERMANENTLY deletes every trashed
  // order (no auto-purge exists anymore; this is the one way out besides Restore).
  const [confirmingEmpty, setConfirmingEmpty] = useState(false)
  const orderCache = useOrderCache()

  // Memoised so their identity is stable across renders: `columns` now feeds the
  // header-actions node (its memo would loop setActions on a fresh array every
  // render — see useHeaderActions), and DataTable keys its column-def memo off it.
  const getCustomerName = useMemo(() => buildCustomerNameResolver(customers), [customers])
  // The same columns as the active list — with the auto-purge gone there is no
  // countdown to show, so the trash needs no extra column.
  const columns = useMemo(() => buildOrderColumns(getCustomerName, tOrder), [getCustomerName, tOrder])

  // Permanently delete EVERY trashed order (the full trash, not the filtered
  // view — "empty trash" means empty). Fire-and-forget batched deletes (see
  // hardDeleteOrders); photos are swept server-side by the cleanupOrderPhotos
  // function on each document delete. Invalidate every order cache so the trash
  // list refetches empty and a cached detail entry of a deleted order drops.
  const handleEmptyTrash = () => {
    hardDeleteOrders(orders.map((o) => o.id))
    orderCache.invalidateAll()
    setConfirmingEmpty(false)
  }

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
          from the table below). "Empty trash" lives on its right — the one
          destructive bulk action of this screen, gated behind a confirm. */}
      {orders.length > 0 && (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-3 border-b border-border bg-danger-bg ${SCREEN_GUTTER_X} py-2`}
        >
          <span className="text-sm font-medium text-danger">{t('trash.banner')}</span>
          <Button variant="danger" size="sm" onClick={() => setConfirmingEmpty(true)}>
            {t('trash.emptyTrash')}
          </Button>
        </div>
      )}

      <DataTable
        orders={visibleOrders}
        columns={columns}
        onRowClick={(order) => navigate(`/orders/${order.id}`)}
        emptyMessage={filterActive ? t('common:nothingFound') : t('trash.empty')}
        sort={sort}
        onSortChange={setSort}
      />

      {/* Confirm before emptying: this is the app's ONLY unrecoverable delete
          (documents AND their photos are gone for good), so the copy spells out
          the count and the finality. */}
      {confirmingEmpty && (
        <ConfirmModal
          title={t('trash.emptyTrashTitle')}
          body={t('trash.emptyTrashBody', { count: orders.length })}
          confirmLabel={t('trash.emptyTrashConfirm')}
          cancelLabel={t('common:cancel')}
          onConfirm={handleEmptyTrash}
          onCancel={() => setConfirmingEmpty(false)}
        />
      )}
    </>
  )
}

export default DeletedOrdersPage
