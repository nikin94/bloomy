import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OrderForm from '@/components/OrderForm/OrderForm'
import { createOrder } from '@/firebase/orders'
import { useOrderCache } from '@/queries/orders'
import { useCustomerCache } from '@/queries/customers'
import { useConsumeNavState } from '@/hooks/useConsumeNavState'
import { usePageHeaderTitle } from '@/hooks/usePageHeaderTitle'
import type { Order } from '@/types/order'

// Create-order screen: a thin wrapper over the shared OrderForm. The form owns
// all input state and validation; this page only says how a finished order is
// persisted (createOrder) and where to go afterwards.
const NewOrderPage = () => {
  const navigate = useNavigate()
  const { t } = useTranslation('order')
  const orderCache = useOrderCache()
  const customerCache = useCustomerCache()

  // MOBILE top bar names this screen ("Новый заказ"), like every other inner
  // page; the form's own heading below hides on phones (headingClassName) so
  // the screen is never named twice.
  usePageHeaderTitle(t('form.newHeading'))

  // "Repeat" (repeat order) navigates here with the source order in history
  // state; OrderForm seeds a fresh create form from its contents. Consumed once
  // (then stripped from history), so a refresh or back-nav starts a blank order.
  const seed = useConsumeNavState<{ repeatOrder?: Order }>()?.repeatOrder

  return (
    <OrderForm
      heading={t('form.newHeading')}
      // Desktop-only (the mobile bar above carries the title), sized to match
      // the order/edit pages' h1 so all three order screens share one heading
      // typography.
      headingClassName="max-md:hidden text-2xl"
      seed={seed}
      onCancel={() => navigate('/orders')}
      onSubmit={async (order, orderId) => {
        // Stamp the creation time here; the form leaves `dateCreated` to the
        // caller so edit can preserve the original instead of overwriting it.
        // Create the doc on the form's pre-generated id.
        const id = await createOrder({ ...order, dateCreated: Date.now() }, orderId)
        // The new order — and any new customer the form created — must show on the
        // lists, so invalidate the order + customer caches (they refetch on the next
        // mount). Then go to the list and pass the new id so it briefly highlights
        // the freshly created row.
        orderCache.invalidateAll()
        customerCache.invalidateAll()
        navigate('/orders', { state: { highlightId: id } })
      }}
    />
  )
}

export default NewOrderPage
