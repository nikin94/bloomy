import { useEffect, useState } from 'react'
import AppHeader from '../../components/AppHeader/AppHeader'
import Spinner from '../../components/Spinner/Spinner'
import Button from '../../components/Button/Button'
import { fetchDeletedOrders, restoreOrder } from '../../firebase/orders'
import { fetchCustomers } from '../../firebase/customers'
import { useAuth } from '../../context/authContext'
import { formatDate, formatMoney } from '../../utils/format'
import { getTotalMinor } from '../../types/order'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

// One soft-deleted order in the trash: its number, customer, date and total, with
// a Restore action. Confirming restores the record and the parent drops the row.
// Deleted orders are NOT linked to the detail page — fetchOrder treats them as
// gone, so a row link would only dead-end on "not found"; restore is the one
// action here. Extracted from the map so the loop body is its own component.
const DeletedOrderRow = ({
  order,
  customerName,
  onRestore,
}: {
  order: Order
  customerName: string
  onRestore: (id: string) => Promise<void>
}) => {
  const [restoring, setRestoring] = useState(false)

  // On success the parent removes this row from the list, unmounting us; on
  // failure (surfaced page-level) we reset so the user can retry.
  const restore = async () => {
    setRestoring(true)
    try {
      await onRestore(order.id)
    } catch {
      setRestoring(false)
    }
  }

  return (
    <li className="flex items-center gap-3 border-b border-border py-3">
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-heading">
          Заказ №{order.number} · {customerName}
        </p>
        <p className="m-0 truncate text-sm text-text">
          {formatDate(order.dateCreated)} · {formatMoney(getTotalMinor(order))}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={restore} disabled={restoring} className="shrink-0">
        {restoring ? 'Восстановление…' : 'Восстановить'}
      </Button>
    </li>
  )
}

// Trash screen: lists the signed-in user's soft-deleted orders and lets each be
// restored back into the active list. Reached from the "Корзина" nav link. The
// customer name is resolved the same way the orders list does — load customers
// once (including deleted ones) and look the name up in memory.
const DeletedOrdersPage = () => {
  // Guaranteed non-null under ProtectedRoute, but read defensively and gate on it.
  const { user } = useAuth()
  const ownerId = user?.uid
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  // Two separate errors: a load failure means there is no list to show, so it
  // replaces the content; a restore failure happens with the list already on
  // screen, so it surfaces above the list without unmounting it.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useEffect(() => {
    if (!ownerId) return
    let active = true
    // `includeDeleted` so an order whose customer was also soft-deleted still
    // resolves the name instead of falling back to "—".
    Promise.all([fetchDeletedOrders(ownerId), fetchCustomers(ownerId, { includeDeleted: true })])
      .then(([orderData, customerData]) => {
        if (!active) return
        setOrders(orderData)
        setCustomers(customerData)
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить корзину')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [ownerId])

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]))
  const getCustomerName = (id: string) => customerNameById.get(id) ?? '—'

  const handleRestore = async (id: string) => {
    setRestoreError(null)
    try {
      await restoreOrder(id)
      setOrders((prev) => prev.filter((o) => o.id !== id))
    } catch (err: unknown) {
      setRestoreError(err instanceof Error ? err.message : 'Не удалось восстановить заказ')
      throw err
    }
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {loading && <Spinner />}
          {loadError && <p className="m-0 text-danger">{loadError}</p>}

          {!loading && !loadError && (
            <>
              {restoreError && (
                <p role="alert" className="m-0 text-danger">
                  {restoreError}
                </p>
              )}
              {orders.length === 0 ? (
                <p className="m-0 text-text">Корзина пуста</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {orders.map((order) => (
                    <DeletedOrderRow
                      key={order.id}
                      order={order}
                      customerName={getCustomerName(order.customerId)}
                      onRestore={handleRestore}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default DeletedOrdersPage
