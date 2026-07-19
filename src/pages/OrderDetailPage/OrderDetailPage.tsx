import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { patchOrder, softDeleteOrder, restoreOrder } from '@/firebase/orders'
import type { OrderPatch } from '@/firebase/orders'
import { useOrder, useOrderCache } from '@/queries/orders'
import { useCustomer } from '@/queries/customers'
import { formatDate, formatMoney } from '@/utils/format'
import {
  getSubtotalMinor,
  plantsByValueDesc,
  resolveCompletedAt,
  formatOrderNumber,
  isOrderDeleted,
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
import { SCREEN_PADDING, SCREEN_GUTTER_X } from '@/styles/screenStyles'
import { useOwnerId } from '@/hooks/useOwnerId'
import { useHeaderTitle } from '@/context/headerTitleContext'
import Spinner from '@/components/Spinner/Spinner'
import Button from '@/components/Button/Button'
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal'
import OrderPhotos from '@/components/OrderPhotos/OrderPhotos'
import DetailRow from '@/components/DetailRow/DetailRow'
import Chip from '@/components/Chip/Chip'
import PencilIcon from '@/components/icons/PencilIcon'
import RepeatIcon from '@/components/icons/RepeatIcon'
import TrashIcon from '@/components/icons/TrashIcon'
import InlineStatusField from './InlineStatusField'
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
  // Delete is confirmed in a modal (destructive, so not a one-click action).
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Repeat is confirmed too (owner request): it jumps into a prefilled create
  // form, and the confirm's body explains what carries over before the jump.
  const [confirmingRepeat, setConfirmingRepeat] = useState(false)

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
  // default to not-deleted until it resolves. No purge countdown anymore — a
  // trashed order stays in the trash until restored or hard-deleted there.
  const isDeleted = order ? isOrderDeleted(order) : false

  // MOBILE top bar names this screen with the order itself: the number on the
  // title line, the creation date right under it (owner request — it frees the
  // content's first row for the client + actions). Published through the layout's
  // title slot (see headerTitleContext); null until the order loads keeps the bar
  // quiet instead of flashing a placeholder. Memoised per the slot's contract.
  // Desktop is untouched — the bar is md:hidden, the in-content heading remains.
  const headerTitle = useMemo(
    () =>
      order ? (
        <div className="flex min-w-0 flex-col">
          <h1 className="m-0 min-w-0 truncate text-lg font-semibold leading-tight text-heading">
            {t('detail.title', { number: formatOrderNumber(order.number) })}
            {order.number === null && (
              <span className="ml-2 text-xs font-normal text-text">{t('detail.unsynced')}</span>
            )}
          </h1>
          <span className="mt-0.5 text-xs leading-tight text-text">
            {formatDate(order.dateCreated)}
          </span>
        </div>
      ) : null,
    [order, t],
  )
  useHeaderTitle(headerTitle)

  return (
    <>
      {/* Deleted banner — pinned above the scrolling body so it stays visible
          (and Restore stays reachable) however far the order is scrolled. */}
      {isDeleted && (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-3 border-b border-border bg-danger-bg ${SCREEN_GUTTER_X} py-3`}
        >
          <span className="text-sm font-medium text-danger">{t('detail.deletedBanner')}</span>
          <Button variant="primary" size="sm" onClick={handleRestore}>
            {t('common:restore')}
          </Button>
        </div>
      )}

      {/* SCREEN_PADDING: the shared p-2/md:p-4 gutter every screen carries (see
          screenStyles). max-md:pt-1.5 (6px) still overrides the top on a phone:
          it matches the mobile bar's own py-1.5 bottom padding, so the gap
          between the bar and the first content row (client + the action stack,
          which begin at the same level) reads as one even rhythm continuing
          down from the burger. */}
      <div className={`overflow-auto ${SCREEN_PADDING} max-md:pt-1.5`}>
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
          {/* Number + date — DESKTOP only: on a phone they moved into the top
              bar (see the useHeaderTitle publish above), so repeating them here
              would name the screen twice. items-baseline drops the small date
              onto the h1's baseline instead of centring it against the heading. */}
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 max-md:hidden">
            <h1 className="m-0 text-2xl font-semibold text-heading">
              {t('detail.title', { number: formatOrderNumber(order.number) })}
              {order.number === null && (
                <span className="ml-2 align-middle text-sm font-normal text-text">
                  {t('detail.unsynced')}
                </span>
              )}
            </h1>
            <span className="text-sm text-text">{formatDate(order.dateCreated)}</span>
          </header>

          {/* First content row (owner layout experiment): the CLIENT on the
              left — name (a link to their page) with the phone right under it,
              no "Клиент"/"Телефон" labels (both are self-evident here) — and
              the actions as a VERTICAL stack pinned to the right edge,
              visually continuing down from the bar's burger button: on a phone
              the same 40px boxes (size="icon" + size-6 glyphs) and the same
              gap-2 the bar uses, sitting exactly under the burger now that the
              shared screen gutter (p-2) equals the bar's inset (px-2). A
              trashed order is read-only (Restore lives in the banner), so the
              stack hides entirely. */}
          <section className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              {customer ? (
                <Link
                  to={`/customers/${customer.id}`}
                  className="min-w-0 break-words text-lg font-medium text-primary no-underline hover:underline"
                >
                  {customer.name}
                </Link>
              ) : (
                <span className="text-lg text-heading">—</span>
              )}
              {customer?.phone && <span className="text-sm text-text">{customer.phone}</span>}
              {/* Delivery address, right under the phone (owner request): the
                  left block reads name → phone → where to bring it, so the
                  labelled "Адрес доставки" row below is gone — this IS the
                  address now. mt-1 sets it slightly apart from the contact
                  lines; break-words so a long unbroken address wraps instead
                  of pushing into the action stack. */}
              <span className="mt-1 min-w-0 break-words text-heading">
                {order.address || '—'}
              </span>
              {/* Enum badges under the address (owner request): the marketplace
                  source first — the one marker worth an accent color — then the
                  payment and delivery methods as quiet chips. These REPLACE the
                  labelled logistics rows that used to sit in the details block
                  (same info shown twice would be noise); each chip carries an
                  sr-only field name, so nothing is lost to screen readers. */}
              <div data-testid="order-chips" className="mt-2 flex flex-wrap items-center gap-1.5">
                {order.source && (
                  <Chip accent srLabel={t('detail.source')}>
                    {tOrder(`source.${order.source}`)}
                  </Chip>
                )}
                <Chip srLabel={t('detail.paymentMethod')}>
                  {paymentMethodLabel(tOrder, order.paymentMethod)}
                </Chip>
                <Chip srLabel={t('detail.deliveryMethod')}>
                  {deliveryMethodLabel(tOrder, order.deliveryMethod)}
                </Chip>
              </div>
            </div>
            {/* On a phone the rail is icon-only 40px squares (the same boxes as
                the bar's burger — the p-2 gutter now equals the bar's px-2, so
                no margin compensation is needed for them to line up). From md
                up each button ALSO shows its label text beside the icon
                (owner request): wider targets read better with the mouse, and
                the desktop has the width to spare. items-stretch (flex-col
                default) sizes all three to the widest label, so the rail keeps
                one straight left edge; md:justify-start left-aligns the
                icon+label pairs within that shared width. aria-label stays on
                every width — it IS the accessible name (stable for screen
                readers and the tests), the md+ text is presentation. */}
            {!isDeleted && (
              <div className="flex shrink-0 flex-col gap-2">
                <Button
                  variant="primary"
                  size="icon"
                  onClick={() => navigate(`/orders/${order.id}/edit`)}
                  aria-label={t('detail.edit')}
                  title={t('detail.edit')}
                  className="md:justify-start md:gap-2 md:px-3"
                >
                  <PencilIcon className="size-6" />
                  <span aria-hidden="true" className="max-md:hidden">
                    {t('detail.edit')}
                  </span>
                </Button>
                {/* Repeat: open the create form seeded from this order's
                    contents (customer + plants + logistics), as a fresh order.
                    Confirmed first (see the modal below) so the jump into a
                    prefilled form is never a surprise from a stray tap. */}
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setConfirmingRepeat(true)}
                  aria-label={t('detail.repeat')}
                  title={t('detail.repeat')}
                  className="md:justify-start md:gap-2 md:px-3"
                >
                  <RepeatIcon className="size-6" />
                  <span aria-hidden="true" className="max-md:hidden">
                    {t('detail.repeat')}
                  </span>
                </Button>
                <Button
                  variant="danger"
                  size="icon"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label={t('detail.delete')}
                  title={t('detail.delete')}
                  className="md:justify-start md:gap-2 md:px-3"
                >
                  <TrashIcon className="size-6" />
                  <span aria-hidden="true" className="max-md:hidden">
                    {t('detail.delete')}
                  </span>
                </Button>
              </div>
            )}
          </section>

          {/* Section divider before the plant list. A separate flex child of
              the gap-6 column, so the parent gap gives it the SAME 24px above
              and below (the page's divider rhythm). */}
          <span aria-hidden="true" className="h-px w-full bg-border" />

          {/* Itemized plant list. A 5-column table can't fit a 320px phone, so
              below `sm` it's broken into one stacked card per plant (name +
              line-total on top, "qty × unit price" below); from `sm` up the full
              table shows. Both read from the same value-sorted list. */}
          <section className="flex flex-col gap-2">
            {/* leading-none: the title is a divider CONTACT — text-lg's default
                line box would add ~5px of its own leading under the divider,
                breaking the 24px rhythm the sharp button edge above it keeps. */}
            <h2 className="m-0 text-lg font-semibold leading-none text-heading">{t('detail.plantsTitle')}</h2>
            <ul className="m-0 flex list-none flex-col p-0 sm:hidden">
              {plantsByValueDesc(order.plants).map((item, index) => (
                <li key={index} className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0">
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
                  <tr key={index} className="border-b border-border last:border-b-0">
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

            {/* Money summary — the SAME presentation the order card and the
                form footer settled on (#175/#185): the headline is the bold
                PLANTS-ONLY sum, with the delivery cost in small type directly
                under it — rendered only when one was entered, so a free
                delivery doesn't print a noisy "+ delivery 0". Replaces the
                old three-line subtotal/delivery/Итого breakdown (owner
                request): one row instead of three, no internal hairline.
                Full width on a phone (label left, money right) so it lines
                up with the plant cards; shrink-wrapped right from `sm` up.
                Sized like the plant rows themselves (owner request): base
                below `sm` where the cards read base, the table's 0.8333rem
                from `sm` up — bold either way. leading-none on the label +
                sum: they are the contact ABOVE the details divider, so their
                line boxes must not pad the 24px rhythm (the smaller delivery
                note below keeps its own leading — it's not the contact when
                present, and it only shows for a paid delivery). */}
            <div className="flex w-full items-baseline justify-between gap-8 text-[0.8333rem] max-sm:text-base sm:w-auto sm:gap-12 sm:self-end">
              <span className="font-semibold leading-none text-heading">{t('detail.subtotal')}</span>
              <span className="flex flex-col items-end">
                <span className="font-semibold leading-none text-heading tabular-nums">
                  {formatMoney(getSubtotalMinor(order), order.currency)}
                </span>
                {order.deliveryPriceMinor > 0 && (
                  <span className="whitespace-nowrap text-xs text-text">
                    {t('form.totalDelivery', {
                      amount: formatMoney(order.deliveryPriceMinor, order.currency),
                    })}
                  </span>
                )}
              </span>
            </div>
          </section>

          {/* Section divider after the money summary — same standalone flex
              child as the one above the plant list, so the column's gap-6
              gives it the identical 24px above and below. */}
          <span aria-hidden="true" className="h-px w-full bg-border" />

          {/* The remaining details. The two statuses are editable inline (the
              frequent "mark paid/done" action) without opening the full edit
              form; the rest is read-only and changed via "Редактировать".
              -mt-3 compensates what sits between the divider and the first
              row's GLYPHS: the DetailRow's own py-2 top padding (8px) plus the
              label's half-leading (~4px), so the visible text keeps the same
              24px the money line holds on the divider's other side. */}
          <section className="-mt-3 flex flex-col">
            {/* The two statuses + the prepaid amount lead the details (owner
                request: right under the plant list) — marking paid/done is the
                frequent action here, and the prepayment is what those statuses
                are about. The logistics rows follow below. */}
            <InlineStatusField
              label={t('detail.paymentStatus')}
              value={order.paymentStatus}
              options={paymentStatusOptions(tOrder)}
              onChange={(value) => saveStatus({ paymentStatus: asEnum(PAYMENT_STATUS_VALUES, value, order.paymentStatus) })}
              readOnly={isDeleted}
            />
            {/* Prepaid amount — visible ONLY while the status is 'prepaid'
                (owner request): once the order is marked paid the row leaves
                the page, though the stored field survives as payment history.
                The REMAINDER is derived live (never stored) from the PLANTS
                sum only — delivery is never folded into a displayed total
                (owner rule, same as the form footer) — and prints only while
                something is actually left to pay. */}
            {order.paymentStatus === 'prepaid' && order.prepaidAmountMinor !== undefined && (
              <DetailRow
                label={t('detail.prepaid')}
                value={
                  getSubtotalMinor(order) > order.prepaidAmountMinor ? (
                    <span className="flex flex-col">
                      <span className="tabular-nums">
                        {formatMoney(order.prepaidAmountMinor, order.currency)}
                      </span>
                      <span className="text-sm text-text">
                        {t('detail.prepaidRemaining', {
                          amount: formatMoney(
                            getSubtotalMinor(order) - order.prepaidAmountMinor,
                            order.currency,
                          ),
                        })}
                      </span>
                    </span>
                  ) : (
                    <span className="tabular-nums">
                      {formatMoney(order.prepaidAmountMinor, order.currency)}
                    </span>
                  )
                }
              />
            )}
            <InlineStatusField
              label={t('detail.status')}
              value={order.status}
              options={orderStatusOptions(tOrder)}
              onChange={(value) => saveStatus({ status: asEnum(ORDER_STATUS_VALUES, value, order.status) })}
              readOnly={isDeleted}
            />
            {/* The logistics (source / payment / delivery method) moved out of
                this block into the chips under the address — see the client
                section above. Only the remaining per-order facts stay here. */}
            {order.completedAt && <DetailRow label={t('detail.completed')} value={formatDate(order.completedAt)} />}
            {order.comment && <DetailRow label={t('detail.comment')} value={order.comment} />}
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
          body={t('detail.deleteBody')}
          confirmLabel={t('common:delete')}
          cancelLabel={t('common:cancel')}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {/* Repeat confirm (owner request): a short heads-up on what the jump does —
          a NEW prefilled order, per-instance state starts fresh — so the button
          never teleports the user into a form unannounced. Primary (not danger):
          nothing destructive happens, the current order is untouched. */}
      {confirmingRepeat && order && (
        <ConfirmModal
          title={t('detail.repeatTitle')}
          body={t('detail.repeatBody')}
          confirmLabel={t('detail.repeat')}
          cancelLabel={t('common:cancel')}
          confirmVariant="primary"
          onConfirm={() => navigate('/orders/new', { state: { repeatOrder: order } })}
          onCancel={() => setConfirmingRepeat(false)}
        />
      )}
      </div>
    </>
  )
}

export default OrderDetailPage
