import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DataTable from '../../components/DataTable/DataTable'
import { fetchOrders } from '../../lib/orders'
import { ORDER_COLUMNS } from '../../types/order'
import type { Order } from '../../types/order'
import styles from './OrdersPage.module.css'

function OrdersPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchOrders()
      .then((data) => {
        if (active) setOrders(data)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Не удалось загрузить заказы')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Заказы</h1>
      </header>

      {loading && <p className={styles.status}>Загрузка…</p>}
      {error && <p className={`${styles.status} ${styles.error}`}>{error}</p>}

      {!loading && !error && (
        <DataTable
          orders={orders}
          columns={ORDER_COLUMNS}
          onRowClick={(order) => navigate(`/orders/${order.id}`)}
        />
      )}
    </div>
  )
}

export default OrdersPage
