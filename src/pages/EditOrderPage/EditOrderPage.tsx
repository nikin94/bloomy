import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OrderForm from '@/components/OrderForm/OrderForm'
import Spinner from '@/components/Spinner/Spinner'
import { updateOrder } from '@/firebase/orders'
import { useOrder, useOrderCache } from '@/queries/orders'
import { useCustomerCache } from '@/queries/customers'
import { useOwnerId } from '@/hooks/useOwnerId'
import { formatOrderNumber } from '@/types/order'

// Edit-order screen: loads the order, then hands it to the shared OrderForm
// prefilled. The form is mounted only once the order is loaded (it reads
// `initialOrder` once on mount). Saving overwrites the order in place — the id
// and per-owner number are preserved, since updateOrder never touches the
// numbering counter; the original number and dateCreated are passed back through.
const EditOrderPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation('order')
  const ownerId = useOwnerId()

  // Prefill order from the shared query cache (active order — edit isn't offered on
  // a trashed one). The form reads `initialOrder` once, so it's mounted only once
  // the order is loaded.
  const orderQuery = useOrder(id, ownerId)
  const order = orderQuery.data ?? null
  const orderCache = useOrderCache()
  const customerCache = useCustomerCache()

  if (orderQuery.isLoading) return <Spinner />

  if (orderQuery.error || !order) {
    return (
      <div className="p-6">
        <p className="text-text">{orderQuery.error?.message || t('detail.notFound')}</p>
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
