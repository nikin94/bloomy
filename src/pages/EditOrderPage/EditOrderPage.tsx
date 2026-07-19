import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OrderForm from '@/components/OrderForm/OrderForm'
import { updateOrder } from '@/firebase/orders'
import { useOrderSuspense, useOrderCache } from '@/queries/orders'
import { useCustomerCache } from '@/queries/customers'
import { useRequiredOwnerId } from '@/hooks/useOwnerId'
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

  if (!order) {
    return (
      <div className={SCREEN_PADDING}>
        <p className="text-text">{t('detail.notFound')}</p>
      </div>
    )
  }

  return (
    <OrderForm
      heading={t('form.editHeading', { number: formatOrderNumber(order.number) })}
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
