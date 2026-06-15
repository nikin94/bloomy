import { useNavigate } from 'react-router-dom'
import OrderForm from '../../components/OrderForm/OrderForm'
import { createOrder } from '../../firebase/orders'

// Create-order screen: a thin wrapper over the shared OrderForm. The form owns
// all input state and validation; this page only says how a finished order is
// persisted (createOrder) and where to go afterwards.
const NewOrderPage = () => {
  const navigate = useNavigate()

  return (
    <OrderForm
      heading="Новый заказ"
      onCancel={() => navigate('/orders')}
      onSubmit={async (order) => {
        const id = await createOrder(order)
        // Go to the list (not the order page) and pass the new id so the list
        // can briefly highlight the freshly created order at the top.
        navigate('/orders', { state: { highlightId: id } })
      }}
    />
  )
}

export default NewOrderPage
