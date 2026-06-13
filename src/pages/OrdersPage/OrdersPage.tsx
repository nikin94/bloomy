import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../../components/AppHeader/AppHeader'
import DataTable from '../../components/DataTable/DataTable'
import Spinner from '../../components/Spinner/Spinner'
import { fetchOrders } from '../../lib/orders'
import { fetchCustomers } from '../../lib/customers'
import { useAuth } from '../../context/auth-context'
import { buildOrderColumns } from '../../types/order'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

function OrdersPage() {
  const navigate = useNavigate()
  // Guaranteed non-null here (rendered under ProtectedRoute), but typed as
  // optional, so we read the uid defensively and gate the fetch on it.
  const { user } = useAuth()
  const ownerId = user?.uid
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ownerId) return
    let active = true
    // Two queries (orders + customers) instead of N+1: customers are loaded
    // once and the table resolves each order's name from this list in memory.
    Promise.all([fetchOrders(ownerId), fetchCustomers(ownerId)])
      .then(([orderData, customerData]) => {
        if (!active) return
        setOrders(orderData)
        setCustomers(customerData)
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
  }, [ownerId])

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]))
  const columns = buildOrderColumns((id) => customerNameById.get(id) ?? '—')

  return (
    <div className="flex h-full flex-col">
      <AppHeader />

      {loading && <Spinner />}
      {error && <p className="px-6 py-8 text-danger">{error}</p>}

      {!loading && !error && (
        <DataTable
          orders={orders}
          columns={columns}
          onRowClick={(order) => navigate(`/orders/${order.id}`)}
        />
      )}
    </div>
  )
}

export default OrdersPage
