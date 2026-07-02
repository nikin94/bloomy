import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchOrder, patchOrder, softDeleteOrder, restoreOrder } from '../../firebase/orders'
import type { OrderPatch } from '../../firebase/orders'
import { fetchCustomer, updateCustomer } from '../../firebase/customers'
import type { CustomerEdits } from '../../firebase/customers'
import { formatDate, formatMoney } from '../../utils/format'
import {
  getSubtotalMinor,
  getTotalMinor,
  plantsByValueDesc,
  deliveryMethodLabel,
  paymentMethodLabel,
  paymentStatusOptions,
  shipmentStatusOptions,
  resolveCompletedAt,
  formatOrderNumber,
  isOrderDeleted,
  trashDaysLeft,
  TRASH_RETENTION_DAYS,
} from '../../types/order'
import { useAuth } from '../../context/authContext'
import Spinner from '../../components/Spinner/Spinner'
import Select from '../../components/Select/Select'
import Button from '../../components/Button/Button'
import Modal from '../../components/Modal/Modal'
import CustomerForm from '../../components/CustomerForm/CustomerForm'
import OrderPhotos from '../../components/OrderPhotos/OrderPhotos'
import DetailRow from '../../components/DetailRow/DetailRow'
import PencilIcon from '../../components/icons/PencilIcon'
import type { Currency, Order } from '../../types/order'
import type { Customer } from '../../types/customer'

const OrderDetailPage = () => {
  const { t } = useTranslation(['order', 'common'])
  // Order-bound t for the option/label helpers (typed TFunction<'order'>).
  const { t: tOrder } = useTranslation('order')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const ownerId = user?.uid
  const [order, setOrder] = useState<Order | null>(null)
  // "Now" for the trash purge countdown, captured once on mount (see daysLeft).
  const [mountNow] = useState(() => Date.now())
  // Resolved live from the customers collection. Stays null when the customer
  // was deleted (a dangling customerId must not crash the page).
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Delete is confirmed in a modal (destructive, so not a one-click action).
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // The customer's name lives on the customer record, not the order, so it's
  // edited here in a dialog (the shared CustomerForm) — fixing it where it's seen
  // rather than sending the user to the customers page.
  const [editingCustomer, setEditingCustomer] = useState(false)

  useEffect(() => {
    if (!id || !ownerId) return
    let active = true
    // includeDeleted: a trashed order opens here read-only (deleted banner +
    // Restore) instead of dead-ending on "not found".
    fetchOrder(id, ownerId, { includeDeleted: true })
      .then(async (data) => {
        if (!active) return
        setOrder(data)
        if (data) {
          const c = await fetchCustomer(data.customerId)
          if (active) setCustomer(c)
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : t('detail.loadError'))
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
  }, [id, ownerId])

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
    // shipmentStatus), so the merge stays field-scoped.
    const writePatch: OrderPatch = {}
    if (patch.paymentStatus !== undefined) writePatch.paymentStatus = patch.paymentStatus
    // Completion is derived from the shipment status: delivered/cancelled stamps
    // the completion time, any other status clears it (null → removed in patchOrder).
    if (patch.shipmentStatus !== undefined) {
      writePatch.shipmentStatus = patch.shipmentStatus
      const completedAt = resolveCompletedAt(next.shipmentStatus, order.completedAt, Date.now())
      if (completedAt === undefined) {
        delete next.completedAt
        writePatch.completedAt = null
      } else {
        next.completedAt = completedAt
        writePatch.completedAt = completedAt
      }
    }
    setOrder(next)
    patchOrder(next.id, writePatch)
  }

  // Persist the customer's edited fields, then mirror them onto the local
  // customer so the page (the "Клиент"/"Телефон" rows) updates live without a
  // refetch. Empty optional fields drop to undefined, matching updateCustomer.
  // updateCustomer is fire-and-forget (offline-safe), so this never blocks and
  // the dialog closes at once; a failed write is reported to Sentry.
  const handleSaveCustomer = async (edits: CustomerEdits) => {
    if (!customer) return
    updateCustomer(customer.id, edits)
    const trimmed = (value: string | undefined) =>
      value && value.trim() !== '' ? value.trim() : undefined
    setCustomer({
      ...customer,
      name: edits.name.trim(),
      phone: trimmed(edits.phone),
      address: trimmed(edits.address),
      note: trimmed(edits.note),
    })
    setEditingCustomer(false)
  }

  // Update the order's photo list: reflect it locally at once, then persist the
  // new full list via patchOrder (fire-and-forget, per-field merge — offline-safe
  // and won't clobber a concurrent status change). The actual upload/delete of
  // the image bytes is handled inside OrderPhotos.
  const handlePhotosChange = (photos: string[]) => {
    if (!order) return
    setOrder({ ...order, photos })
    patchOrder(order.id, { photos })
  }

  // Soft-delete the order, then return to the list (where it no longer appears).
  // The write is fire-and-forget (offline-safe) so deleting never blocks; the
  // order moves to the trash locally at once and syncs on reconnect.
  const handleDelete = () => {
    if (!order) return
    softDeleteOrder(order.id)
    navigate('/orders')
  }

  // Restore a trashed order back to the active list, then return to the trash
  // (where it no longer appears). Fire-and-forget, same offline semantics as
  // delete — the optimistic navigation never waits on the write.
  const handleRestore = () => {
    if (!order) return
    restoreOrder(order.id)
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
      {error && <p className="text-danger">{error}</p>}
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
                edit/delete are hidden here until it's restored. On a phone the
                actions stack full-width, one button per line (an easy tap target);
                from sm up they collapse back to the compact inline row. */}
            {!isDeleted && (
              <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/orders/${order.id}/edit`)}
                  className="w-full sm:w-auto"
                >
                  {t('detail.edit')}
                </Button>
                {/* Repeat: open the create form seeded from this order's
                    contents (customer + plants + logistics), as a fresh order.
                    The source order rides in router state — no schema change. */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/orders/new', { state: { repeatOrder: order } })}
                  className="w-full sm:w-auto"
                >
                  {t('detail.repeat')}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                  className="w-full sm:w-auto"
                >
                  {t('detail.delete')}
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
              action={
                customer && !isDeleted ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setEditingCustomer(true)}
                    aria-label={t('detail.editCustomer')}
                    title={t('detail.editCustomer')}
                  >
                    <PencilIcon />
                  </Button>
                ) : undefined
              }
            />
            {customer?.phone && <DetailRow label={t('detail.phone')} value={customer.phone} />}
            <DetailRow label={t('detail.deliveryAddress')} value={order.address || '—'} />
            <DetailRow label={t('detail.deliveryMethod')} value={deliveryMethodLabel(tOrder, order.deliveryMethod)} />
            <DetailRow label={t('detail.paymentMethod')} value={paymentMethodLabel(tOrder, order.paymentMethod)} />
            <InlineStatusField
              label={t('detail.paymentStatus')}
              value={order.paymentStatus}
              options={paymentStatusOptions(tOrder)}
              onChange={(value) => saveStatus({ paymentStatus: value as Order['paymentStatus'] })}
              readOnly={isDeleted}
            />
            <InlineStatusField
              label={t('detail.shipmentStatus')}
              value={order.shipmentStatus}
              options={shipmentStatusOptions(tOrder)}
              onChange={(value) => saveStatus({ shipmentStatus: value as Order['shipmentStatus'] })}
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

          {/* Order photos — owner-scoped, stored under orders/{uid}/{orderId}/.
              ownerId is guaranteed here (ProtectedRoute), but read defensively. */}
          {ownerId && (
            <OrderPhotos
              ownerId={ownerId}
              orderId={order.id}
              photos={order.photos ?? []}
              onChange={handlePhotosChange}
              readOnly={isDeleted}
            />
          )}
        </div>
      )}

      {editingCustomer && customer && (
        <Modal title={t('detail.editCustomerTitle')} onClose={() => setEditingCustomer(false)}>
          <CustomerForm
            initial={{
              name: customer.name,
              phone: customer.phone,
              address: customer.address,
              note: customer.note,
            }}
            onCancel={() => setEditingCustomer(false)}
            onSubmit={handleSaveCustomer}
          />
        </Modal>
      )}

      {confirmingDelete && order && (
        <Modal
          title={t('detail.deleteTitle', { number: formatOrderNumber(order.number) })}
          onClose={() => setConfirmingDelete(false)}
        >
          <p className="m-0 text-text">
            {t('detail.deleteBody', {
              days: t('common:days', { count: TRASH_RETENTION_DAYS }),
            })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="danger" onClick={handleDelete}>
              {t('common:delete')}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              {t('common:cancel')}
            </Button>
          </div>
        </Modal>
      )}
      </div>
    </>
  )
}

// A status row that's editable in place: same layout as DetailRow, but the value is
// a Select. Selecting an option calls onChange, which saves optimistically on
// the page (the write is fire-and-forget, so there's no in-flight disabled
// state). Used for both order statuses. `readOnly` (a trashed order) renders the
// resolved label as plain text instead — the same row layout as Field, so a
// deleted order reads as a static archive rather than an editable record.
const InlineStatusField = ({
  label,
  value,
  options,
  onChange,
  readOnly = false,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  readOnly?: boolean
}) => (
  <DetailRow
    label={label}
    value={
      readOnly ? (
        (options.find((o) => o.value === value)?.label ?? value)
      ) : (
        <div className="w-full sm:max-w-[220px]">
          <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      )
    }
  />
)

const Total = ({
  label,
  value,
  currency,
}: {
  label: string
  value: number
  currency: Currency
}) => (
  <div className="flex justify-between gap-8 text-text">
    <span>{label}</span>
    <span className="text-heading tabular-nums">{formatMoney(value, currency)}</span>
  </div>
)

export default OrderDetailPage
