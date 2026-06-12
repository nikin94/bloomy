import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchOrder } from '../../lib/orders'
import { formatMoney } from '../../lib/format'
import type { Order } from '../../types/order'

function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    fetchOrder(id)
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
  }, [id])

  return (
    <div className="overflow-auto p-6">
      <Link to="/" className="mb-4 inline-block text-accent no-underline hover:underline">
        ← К списку заказов
      </Link>

      {loading && <p className="text-text">Загрузка…</p>}
      {error && <p className="text-danger">{error}</p>}
      {!loading && !error && !order && <p className="text-text">Заказ не найден</p>}

      {order && (
        <>
          <h1 className="mt-0 mb-4 text-2xl font-semibold text-heading">Заказ №{order.id}</h1>
          <div>
            <Field label="Заказчик" value={order.customerName} />
            <Field label="Адрес" value={order.address} />
            <Field label="Растения" value={order.plants.map((p) => p.name).join(', ')} />
            <Field label="Сумма" value={formatMoney(order.totalPrice)} />
            {order.comment && <Field label="Комментарий" value={order.comment} />}
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-border py-2">
      <span className="shrink-0 basis-[200px] text-text">{label}</span>
      <span className="text-heading">{value}</span>
    </div>
  )
}

export default OrderDetailPage
