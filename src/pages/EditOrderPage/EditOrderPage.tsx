import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OrderForm from '@/components/OrderForm/OrderForm'
import { updateOrder } from '@/firebase/orders'
import { useOrderSuspense, useOrderCache } from '@/queries/orders'
import { useCustomerCache } from '@/queries/customers'
import { useRequiredOwnerId } from '@/hooks/useOwnerId'
import { useHeaderTitle } from '@/context/headerTitleContext'
import { formatOrderNumber } from '@/types/order'
import { SCREEN_PADDING } from '@/styles/screenStyles'

// Edit-order screen: loads the order, then hands it to the shared OrderForm
// prefilled. The form is mounted only once the order is loaded (it reads
// `initialOrder` once on mount). Saving overwrites the order in place — the id
// and per-owner number are preserved, since updateOrder never touches the
// numbering counter; the original number and dateCreated are passed back through.
const EditOrderPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation('order')
  const ownerId = useRequiredOwnerId()

  // Prefill order from the shared query cache (active order — edit isn't offered on
  // a trashed one). The read SUSPENDS to the route-level <Suspense> (AppLayout) —
  // the same boundary that holds the lazy chunk — so the first visit shows one
  // continuous spinner instead of a chunk-fallback → page-Spinner handoff that
  // restarted the ring; a load failure throws to the route error boundary. The
  // form reads `initialOrder` once, so it mounts only with the order resolved.
  const order = useOrderSuspense(id, ownerId).data
  const orderCache = useOrderCache()
  const customerCache = useCustomerCache()

  // MOBILE top bar names this screen like the order page does — the order
  // number on the title line — with the small line under it saying
  // "Редактирование" instead of the creation date (owner request; the date
  // belongs to the view screen, the mode word belongs here). Published through
  // the layout's title slot (see headerTitleContext); memoised per the slot's
  // contract; null (no order) keeps the bar quiet. Must run BEFORE the
  // not-found early return — hooks are unconditional.
  const headerTitle = useMemo(
    () =>
      order ? (
        <div className="flex min-w-0 flex-col">
          <h1 className="m-0 min-w-0 truncate text-lg font-semibold leading-tight text-heading">
            {t('detail.title', { number: formatOrderNumber(order.number) })}
          </h1>
          <span className="mt-0.5 text-xs leading-tight text-text">{t('form.editing')}</span>
        </div>
      ) : null,
    [order, t],
  )
  useHeaderTitle(headerTitle)

  if (!order) {
    return (
      <div className={SCREEN_PADDING}>
        <p className="text-text">{t('detail.notFound')}</p>
      </div>
    )
  }

  return (
    <OrderForm
      // DESKTOP-only heading (the mobile bar above carries the same pair): the
      // order number in the heading size with the mode word "Редактирование"
      // small beside it — mirroring the order page's number+date header instead
      // of the old wordy "Редактирование заказа №5" title.
      heading={
        <>
          {t('detail.title', { number: formatOrderNumber(order.number) })}
          <span className="ml-2 text-sm font-normal text-text">{t('form.editing')}</span>
        </>
      }
      headingClassName="max-md:hidden"
      initialOrder={order}
      onCancel={() => navigate(`/orders/${order.id}`)}
      onSubmit={async (fields) => {
        // Save in place (per-field merge), preserving the original id, number and
        // dateCreated; only the form-owned fields change. The mount-time `order`
        // rides along as the diff BASE: updateOrder writes only the fields this
        // edit actually changed, so a concurrent change to an untouched field
        // (e.g. an inline status flip on the detail page or another device)
        // survives instead of being overwritten with the mount-time value.
        // updateOrder is fire-and-forget (offline-safe), so this never blocks.
        // Invalidate the order + customer caches (the edit — and any new customer
        // the form created — must show on the lists and the detail page), then
        // navigate straight back.
        updateOrder(
          order.id,
          {
            ...fields,
            number: order.number,
            dateCreated: order.dateCreated,
          },
          order,
        )
        orderCache.invalidateAll()
        customerCache.invalidateAll()
        navigate(`/orders/${order.id}`)
      }}
    />
  )
}

export default EditOrderPage
