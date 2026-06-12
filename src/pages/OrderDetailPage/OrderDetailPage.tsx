import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchOrder } from '../../lib/orders'
import { formatMoney } from '../../lib/format'
import type { Order } from '../../types/order'
import styles from './OrderDetailPage.module.css'

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
    <div className={styles.page}>
      <Link to="/" className={styles.back}>
        ← К списку заказов
      </Link>

      {loading && <p>Загрузка…</p>}
      {error && <p>{error}</p>}
      {!loading && !error && !order && <p>Заказ не найден</p>}

      {order && (
        <>
          <h1 className={styles.title}>Заказ №{order.id}</h1>
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
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  )
}

export default OrderDetailPage
