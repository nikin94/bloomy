import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { patchOrder, softDeleteOrder, restoreOrder } from '@/firebase/orders'
import type { OrderPatch } from '@/firebase/orders'
import { useOrder, useOrderCache } from '@/queries/orders'
import { useCustomer } from '@/queries/customers'
import { formatDate, formatMoney } from '@/utils/format'
import {
  getSubtotalMinor,
  getTotalMinor,
  plantsByValueDesc,
  resolveCompletedAt,
  formatOrderNumber,
  isOrderDeleted,
  trashDaysLeft,
  TRASH_RETENTION_DAYS,
  PAYMENT_STATUS_VALUES,
  ORDER_STATUS_VALUES,
} from '@/types/order'
import {
  deliveryMethodLabel,
  paymentMethodLabel,
  paymentStatusOptions,
  orderStatusOptions,
} from '@/lib/orderLabels'
import { asEnum } from '@/utils/asEnum'
import { useOwnerId } from '@/hooks/useOwnerId'
import { useNow } from '@/hooks/useNow'
import Spinner from '@/components/Spinner/Spinner'
import Button from '@/components/Button/Button'
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal'
import OrderPhotos from '@/components/OrderPhotos/OrderPhotos'
import DetailRow from '@/components/DetailRow/DetailRow'
import PencilIcon from '@/components/icons/PencilIcon'
import RepeatIcon from '@/components/icons/RepeatIcon'
import TrashIcon from '@/components/icons/TrashIcon'
import InlineStatusField from './InlineStatusField'
import Total from './Total'
import type { Order } from '@/types/order'

const OrderDetailPage = () => {
  const { t } = useTranslation(['order', 'common'])
  // Order-bound t for the option/label helpers (typed TFunction<'order'>).
  const { t: tOrder } = useTranslation('order')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const ownerId = useOwnerId()
  // Order (incl. a trashed one, opened read-only) + its customer from the shared
  // query cache. `includeDeleted` so a stale trash link opens the deleted banner +
  // Restore instead of dead-ending. The customer query enables once the order
  // resolves its customerId; it stays null when the customer was deleted (a
  // dangling customerId must not crash the page).
  const orderQuery = useOrder(id, ownerId, { includeDeleted: true })
  const order = orderQuery.data ?? null
  const customerQuery = useCustomer(order?.customerId)
  const customer = customerQuery.data ?? null
  const orderCache = useOrderCache()
  // Loading until the order resolves and — for a found order — its customer too.
  const loading = orderQuery.isLoading || (order !== null && customerQuery.isLoading)
  const error = orderQuery.error ?? customerQuery.error
  // "Now" for the trash purge countdown, captured once on mount (see daysLeft).
  const mountNow = useNow()
  // Delete is confirmed in a modal (destructive, so not a one-click action).
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Save a single status change inline, optimistically: update the local order
  // right away so the UI feels instant, then write ONLY the changed field(s)
  // (patchOrder is a per-field merge, so this inline toggle never clobbers a
  // concurrent edit to another field on another device). The write is fire-and-
  // forget — it never blocks and works offline — so the optimistic value stays
  // and syncs on reconnect; a failed write is reported to Sentry, not rolled back.
  const saveStatus = (patch: Partial<Order>) => {
    if (!order) return
    const next = { ...order, ...patch }
    // The write touches only the fields the caller changed (paymentStatus OR
    // status), so the merge stays field-scoped.
    const writePatch: OrderPatch = {}
    if (patch.paymentStatus !== undefined) writePatch.paymentStatus = patch.paymentStatus
    // Completion is derived from the order status: delivered/cancelled stamps
    // the completion time, any other status clears it (null → removed in patchOrder).
    if (patch.status !== undefined) {
      writePatch.status = patch.status
      const completedAt = resolveCompletedAt(next.status, order.completedAt, Date.now())
      if (completedAt === undefined) {
        delete next.completedAt
        writePatch.completedAt = null
      } else {
        next.completedAt = completedAt
        writePatch.completedAt = completedAt
      }
    }
    // Optimistically hold the change in the order-detail cache (what this page
    // reads), then persist just the changed field(s) and invalidate the list caches
    // so returning to a list within the stale window shows the new status.
    //
    // BOTH single-order cache entries are updated: the key includes `includeDeleted`
    // (this page reads `true`, the EDIT page reads `false`), so writing only this
    // page's entry would leave the edit form's entry stale-but-fresh — opening Edit
    // within the stale window would then prefill the OLD status, and saving would
    // silently revert this change (and wipe completedAt). saveStatus only runs on
    // an active order (a trashed one is read-only), so the `false` entry is valid.
    orderCache.setOrder(ownerId, next.id, true, () => next)
    orderCache.setOrder(ownerId, next.id, false, () => next)
    patchOrder(next.id, writePatch)
    orderCache.invalidateLists()
  }

  // Soft-delete the order, then return to the list (where it no longer appears).
  // The write is fire-and-forget (offline-safe) so deleting never blocks; the
  // order moves to the trash locally at once and syncs on reconnect. Invalidate
  // every order cache — the row leaves the active list and joins the trash.
  const handleDelete = () => {
    if (!order) return
    softDeleteOrder(order.id)
    orderCache.invalidateAll()
    navigate('/orders')
  }

  // Restore a trashed order back to the active list, then return to the trash
  // (where it no longer appears). Fire-and-forget, same offline semantics as
  // delete — the optimistic navigation never waits on the write. Invalidate every
  // order cache — the row leaves the trash and rejoins the active list.
  const handleRestore = () => {
    if (!order) return
    restoreOrder(order.id)
    orderCache.invalidateAll()
    navigate('/orders/deleted')
  }

  // A trashed order opens read-only: a fixed deleted banner with Restore, no
  // edit/delete, statuses shown as plain text. `order` is null while loading, so
  // default to not-deleted until it resolves.
  const isDeleted = order ? isOrderDeleted(order) : false
  // Whole days until this trashed order is auto-purged — null for a legacy
  // delete with no `deletedAt` (no countdown shown for it). "Now" is captured once
  // on mount (day-granularity; a render-time Date.now() isn't pure).
  const daysLeft = order ? trashDaysLeft(order, mountNow) : null

  return (
    <>
      {/* Deleted banner — pinned above the scrolling body so it stays visible
          (and Restore stays reachable) however far the order is scrolled. */}
      {isDeleted && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-danger-bg px-6 py-3"
        >
          <span className="text-sm font-medium text-danger">
            {t('detail.deletedBanner')}
            {daysLeft !== null && (
              <>
                {' '}
                {t('detail.deletedCountdown', { days: t('common:days', { count: daysLeft }) })}
              </>
            )}
          </span>
          <Button variant="primary" size="sm" onClick={handleRestore}>
            {t('common:restore')}
          </Button>
        </div>
      )}

      <div className="overflow-auto p-4 md:p-6">
      {loading && <Spinner />}
      {error && <p className="text-danger">{error.message || t('detail.loadError')}</p>}
      {!loading && !error && !order && <p className="text-text">{t('detail.notFound')}</p>}

      {/* Gate the body on `!loading`, not just `order`: the customer is fetched
          after the order (loading stays true until both resolve via .finally),
          so rendering on `order` alone would paint the body with customer=null
          and then shift when the phone row appears. Showing it only once
          loading is done makes the whole block appear at once, no jump. */}
      {!loading && order && (
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            {/* Title + date share a line: the date sits right after the number and
                wraps to its own line ONLY when there isn't room (a long number on a
                narrow phone). items-baseline drops the small date onto the h1's
                baseline instead of centring it against the tall heading. */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="m-0 text-2xl font-semibold text-heading">
                {t('detail.title', { number: formatOrderNumber(order.number) })}
                {order.number === null && (
                  <span className="ml-2 align-middle text-sm font-normal text-text">
                    {t('detail.unsynced')}
                  </span>
                )}
              </h1>
              <span className="text-sm text-text">{formatDate(order.dateCreated)}</span>
            </div>
            {/* A trashed order is read-only — Restore lives in the banner, so
                edit/delete are hidden here until it's restored. One row on every
                width: on a phone the three buttons split the full width in equal
                thirds with ICONS in place of the labels (three stacked full-width
                buttons ate half the screen); from sm up the text labels return
                and the row collapses to its natural inline width. aria-label
                keeps the accessible name at the full text on every width, so
                screen readers (and the tests) see one stable name. */}
            {!isDeleted && (
              <div className="flex w-full items-center gap-3 sm:w-auto sm:flex-wrap">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/orders/${order.id}/edit`)}
                  aria-label={t('detail.edit')}
                  className="flex-1 sm:flex-none"
                >
                  <PencilIcon className="size-5 sm:hidden" />
                  <span className="max-sm:hidden">{t('detail.edit')}</span>
                </Button>
                {/* Repeat: open the create form seeded from this order's
                    contents (customer + plants + logistics), as a fresh order.
                    The source order rides in router state — no schema change. */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/orders/new', { state: { repeatOrder: order } })}
                  aria-label={t('detail.repeat')}
                  className="flex-1 sm:flex-none"
                >
                  <RepeatIcon className="size-5 sm:hidden" />
                  <span className="max-sm:hidden">{t('detail.repeat')}</span>
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label={t('detail.delete')}
                  className="flex-1 sm:flex-none"
                >
                  <TrashIcon className="size-5 sm:hidden" />
                  <span className="max-sm:hidden">{t('detail.delete')}</span>
                </Button>
              </div>
            )}
          </header>

          {/* General info. The two statuses are editable inline (the frequent
              "mark paid/shipped" action) without opening the full edit form;
              the rest is read-only and changed via "Редактировать". */}
          <section className="flex flex-col">
            <DetailRow
              label={t('detail.customer')}
              value={
                customer ? (
                  <Link
                    to={`/customers/${customer.id}`}
                    className="text-primary no-underline hover:underline"
                  >
                    {customer.name}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            {customer?.phone && <DetailRow label={t('detail.phone')} value={customer.phone} />}
            <DetailRow label={t('detail.deliveryAddress')} value={order.address || '—'} />
            <DetailRow label={t('detail.deliveryMethod')} value={deliveryMethodLabel(tOrder, order.deliveryMethod)} />
            <DetailRow label={t('detail.paymentMethod')} value={paymentMethodLabel(tOrder, order.paymentMethod)} />
            {/* Marketplace source — shown only when the order carries one, so a
                direct order (the common case, stored with no field) adds no row. */}
            {order.source && (
              <DetailRow label={t('detail.source')} value={tOrder(`source.${order.source}`)} />
            )}
            <InlineStatusField
              label={t('detail.paymentStatus')}
              value={order.paymentStatus}
              options={paymentStatusOptions(tOrder)}
              onChange={(value) => saveStatus({ paymentStatus: asEnum(PAYMENT_STATUS_VALUES, value, order.paymentStatus) })}
              readOnly={isDeleted}
            />
            <InlineStatusField
              label={t('detail.status')}
              value={order.status}
              options={orderStatusOptions(tOrder)}
              onChange={(value) => saveStatus({ status: asEnum(ORDER_STATUS_VALUES, value, order.status) })}
              readOnly={isDeleted}
            />
            {order.completedAt && <DetailRow label={t('detail.completed')} value={formatDate(order.completedAt)} />}
            {order.comment && <DetailRow label={t('detail.comment')} value={order.comment} />}
          </section>

          {/* Itemized plant list. A 5-column table can't fit a 320px phone, so
              below `sm` it's broken into one stacked card per plant (name +
              line-total on top, "qty × unit price" below); from `sm` up the full
              table shows. Both read from the same value-sorted list. */}
          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-lg font-semibold text-heading">{t('detail.plantsTitle')}</h2>
            <ul className="m-0 flex list-none flex-col p-0 sm:hidden">
              {plantsByValueDesc(order.plants).map((item, index) => (
                <li key={index} className="flex flex-col gap-1 border-b border-border py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words text-heading">
                      {index + 1}. {item.name}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-heading">
                      {formatMoney(item.unitPriceMinor * item.quantity, order.currency)}
                    </span>
                  </div>
                  <div className="text-sm tabular-nums text-text">
                    {item.quantity} × {formatMoney(item.unitPriceMinor, order.currency)}
                  </div>
                </li>
              ))}
            </ul>
            <table className="hidden w-full border-collapse text-[0.8333rem] sm:table">
              <thead>
                <tr className="border-b border-border text-left text-sm text-text">
                  <th className="w-8 py-2 pr-3 text-right font-medium tabular-nums">{t('columns.number')}</th>
                  <th className="py-2 pr-3 font-medium">{t('detail.plantName')}</th>
                  <th className="py-2 px-3 text-right font-medium">{t('detail.quantity')}</th>
                  <th className="py-2 px-3 text-right font-medium">{t('detail.price')}</th>
                  <th className="py-2 pl-3 text-right font-medium">{t('detail.lineTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {plantsByValueDesc(order.plants).map((item, index) => (
                  <tr key={index} className="border-b border-border">
                    <td className="py-2 pr-3 text-right text-text tabular-nums">{index + 1}</td>
                    <td className="py-2 pr-3 text-heading">{item.name}</td>
                    <td className="py-2 px-3 text-right text-text tabular-nums">{item.quantity}</td>
                    <td className="py-2 px-3 text-right text-text tabular-nums">
                      {formatMoney(item.unitPriceMinor, order.currency)}
                    </td>
                    <td className="py-2 pl-3 text-right text-heading tabular-nums">
                      {formatMoney(item.unitPriceMinor * item.quantity, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Gift line(s), set apart from the priced rows above: a gift is
                free (quantity 1, price 0 — see the schema), so listing it in
                the money columns would just print noise zeros. */}
            {(order.gifts ?? []).map((gift, index) => (
              <p key={index} className="m-0 text-[0.8333rem] text-heading">
                <span aria-hidden="true">🎁 </span>
                <span className="text-text">{t('detail.gift')}: </span>
                {gift.name}
              </p>
            ))}
          </section>

          {/* Money breakdown — full width on a phone (labels left, amounts right)
              so it lines up with the plant cards; shrink-wrapped to the right from
              `sm` up. */}
          <section className="flex w-full flex-col gap-1 text-[0.8333rem] sm:w-auto sm:self-end">
            <Total label={t('detail.subtotal')} value={getSubtotalMinor(order)} currency={order.currency} />
            <Total label={t('detail.delivery')} value={order.deliveryPriceMinor} currency={order.currency} />
            <div className="mt-1 flex justify-between gap-8 border-t border-border pt-2 font-semibold text-heading">
              <span>{t('detail.total')}</span>
              <span className="tabular-nums">{formatMoney(getTotalMinor(order), order.currency)}</span>
            </div>
          </section>

          {/* Order photos — VIEW-ONLY here: adding/removing photos lives on the
              edit form, so this page never writes. Renders nothing when the
              order has no photos. */}
          <OrderPhotos photos={order.photos ?? []} />
        </div>
      )}

      {confirmingDelete && order && (
        <ConfirmModal
          title={t('detail.deleteTitle', { number: formatOrderNumber(order.number) })}
          body={t('detail.deleteBody', { days: t('common:days', { count: TRASH_RETENTION_DAYS }) })}
          confirmLabel={t('common:delete')}
          cancelLabel={t('common:cancel')}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
      </div>
    </>
  )
}

export default OrderDetailPage
