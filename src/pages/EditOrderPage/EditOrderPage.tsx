import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import OrderForm from '../../components/OrderForm/OrderForm'
import Spinner from '../../components/Spinner/Spinner'
import { fetchOrder, updateOrder } from '../../firebase/orders'
import { useAuth } from '../../context/authContext'
import { formatOrderNumber } from '../../types/order'
import type { Order } from '../../types/order'

// Edit-order screen: loads the order, then hands it to the shared OrderForm
// prefilled. The form is mounted only once the order is loaded (it reads
// `initialOrder` once on mount). Saving overwrites the order in place — the id
// and per-owner number are preserved, since updateOrder never touches the
// numbering counter; the original number and dateCreated are passed back through.
const EditOrderPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const ownerId = user?.uid

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !ownerId) return
    let active = true
    fetchOrder(id, ownerId)
      .then((data) => {
        if (active) setOrder(data)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Не удалось загрузить заказ')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id, ownerId])

  if (loading) return <Spinner />

  if (error || !order) {
    return (
      <div className="p-6">
        <Link to="/orders" className="mb-4 inline-block text-primary no-underline hover:underline">
          ← К списку заказов
        </Link>
        <p className="text-text">{error ?? 'Заказ не найден'}</p>
      </div>
    )
  }

  return (
    <OrderForm
      heading={`Редактирование заказа №${formatOrderNumber(order.number)}`}
      initialOrder={order}
      onCancel={() => navigate(`/orders/${order.id}`)}
      onSubmit={async (fields) => {
        // Overwrite in place, preserving the original id, number and dateCreated;
        // only the form-owned fields change.
        await updateOrder(order.id, {
          ...fields,
          number: order.number,
          dateCreated: order.dateCreated,
        })
        navigate(`/orders/${order.id}`)
      }}
    />
  )
}

export default EditOrderPage
