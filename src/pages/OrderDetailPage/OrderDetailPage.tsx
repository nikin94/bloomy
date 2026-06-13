import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchOrder } from '../../lib/orders'
import { fetchCustomer } from '../../lib/customers'
import { formatMoney } from '../../lib/format'
import { getTotalMinor } from '../../types/order'
import { useAuth } from '../../context/auth-context'
import type { Order } from '../../types/order'

function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const ownerId = user?.uid
  const [order, setOrder] = useState<Order | null>(null)
  // Resolved live from the customers collection. Falls back to "—" when the
  // customer was deleted (a dangling customerId must not crash the page).
  const [customerName, setCustomerName] = useState('—')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !ownerId) return
    let active = true
    fetchOrder(id, ownerId)
      .then(async (data) => {
        if (!active) return
        setOrder(data)
        if (data) {
          const customer = await fetchCustomer(data.customerId)
          if (active) setCustomerName(customer?.name ?? '—')
        }
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

  return (
    <div className="overflow-auto p-6">
      <Link to="/orders" className="mb-4 inline-block text-accent no-underline hover:underline">
        ← К списку заказов
      </Link>

      {loading && <p className="text-text">Загрузка…</p>}
      {error && <p className="text-danger">{error}</p>}
      {!loading && !error && !order && <p className="text-text">Заказ не найден</p>}

      {order && (
        <>
          <h1 className="mt-0 mb-4 text-2xl font-semibold text-heading">
            Заказ {order.number !== undefined ? `№${order.number}` : '№—'}
          </h1>
          <div>
            <Field label="Клиент" value={customerName} />
            <Field label="Адрес" value={order.address} />
            <Field label="Растения" value={order.plants.map((p) => p.name).join(', ')} />
            <Field label="Сумма" value={formatMoney(getTotalMinor(order))} />
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
