import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OrderForm from '@/components/OrderForm/OrderForm'
import { createOrder } from '@/firebase/orders'
import { useOrderCache } from '@/queries/orders'
import { useCustomerCache } from '@/queries/customers'
import type { Order } from '@/types/order'

// Create-order screen: a thin wrapper over the shared OrderForm. The form owns
// all input state and validation; this page only says how a finished order is
// persisted (createOrder) and where to go afterwards.
const NewOrderPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation('order')
  const orderCache = useOrderCache()
  const customerCache = useCustomerCache()

  // "Repeat" (repeat order) navigates here with the source order in history
  // state; OrderForm seeds a fresh create form from its contents. Absent on a
  // normal "new order" navigation (and after a refresh, which drops the state).
  const seed = (location.state as { repeatOrder?: Order } | null)?.repeatOrder

  return (
    <OrderForm
      heading={t('form.newHeading')}
      seed={seed}
      onCancel={() => navigate('/orders')}
      onSubmit={async (order, orderId) => {
        // Stamp the creation time here; the form leaves `dateCreated` to the
        // caller so edit can preserve the original instead of overwriting it.
        // Create the doc on the form's pre-generated id so it matches the id any
        // attached photos were stored under (orders/{ownerId}/{orderId}/...).
        const id = await createOrder({ ...order, dateCreated: Date.now() }, orderId)
        // The new order — and any new customer the form created — must show on the
        // lists, so invalidate the order + customer caches (they refetch on the next
        // mount). Then go to the list (not the order page) and pass the new id so it
        // can briefly highlight the freshly created order at the top.
        orderCache.invalidateAll()
        customerCache.invalidateAll()
        navigate('/orders', { state: { highlightId: id } })
      }}
    />
  )
}

export default NewOrderPage
