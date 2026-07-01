import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('order')
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

  if (loading) return <Spinner />

  if (error || !order) {
    return (
      <div className="p-6">
        <p className="text-text">{error ?? t('detail.notFound')}</p>
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
        // dateCreated; only the form-owned fields change. updateOrder is fire-and-
        // forget (offline-safe), so this never blocks — navigate straight back.
        updateOrder(order.id, {
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
