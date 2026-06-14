import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchOrder } from '../../lib/orders'
import { fetchCustomer } from '../../lib/customers'
import { formatDate, formatMoney } from '../../lib/format'
import {
  getSubtotalMinor,
  getTotalMinor,
  DELIVERY_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  SHIPMENT_STATUS_LABELS,
} from '../../types/order'
import { useAuth } from '../../context/auth-context'
import Spinner from '../../components/Spinner/Spinner'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const ownerId = user?.uid
  const [order, setOrder] = useState<Order | null>(null)
  // Resolved live from the customers collection. Stays null when the customer
  // was deleted (a dangling customerId must not crash the page).
  const [customer, setCustomer] = useState<Customer | null>(null)
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
          const c = await fetchCustomer(data.customerId)
          if (active) setCustomer(c)
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

      {loading && <Spinner />}
      {error && <p className="text-danger">{error}</p>}
      {!loading && !error && !order && <p className="text-text">Заказ не найден</p>}

      {/* Gate the body on `!loading`, not just `order`: the customer is fetched
          after the order (loading stays true until both resolve via .finally),
          so rendering on `order` alone would paint the body with customer=null
          and then shift when the phone row appears. Showing it only once
          loading is done makes the whole block appear at once, no jump. */}
      {!loading && order && (
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <header className="flex items-baseline justify-between gap-3">
            <h1 className="m-0 text-2xl font-semibold text-heading">
              Заказ №{order.number}
            </h1>
            <span className="text-sm text-text">{formatDate(order.dateCreated)}</span>
          </header>

          {/* General info */}
          <section className="flex flex-col">
            <Field label="Клиент" value={customer?.name ?? '—'} />
            {customer?.phone && <Field label="Телефон" value={customer.phone} />}
            <Field label="Адрес доставки" value={order.address || '—'} />
            <Field label="Способ доставки" value={DELIVERY_METHOD_LABELS[order.deliveryMethod]} />
            <Field label="Способ оплаты" value={PAYMENT_METHOD_LABELS[order.paymentMethod]} />
            <Field label="Статус оплаты" value={PAYMENT_STATUS_LABELS[order.paymentStatus]} />
            <Field label="Статус отправки" value={SHIPMENT_STATUS_LABELS[order.shipmentStatus]} />
            {order.comment && <Field label="Комментарий" value={order.comment} />}
          </section>

          {/* Itemized plant list */}
          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-lg font-semibold text-heading">Растения</h2>
            <table className="w-full border-collapse text-[15px]">
              <thead>
                <tr className="border-b border-border text-left text-sm text-text">
                  <th className="py-2 pr-3 font-medium">Название</th>
                  <th className="py-2 px-3 text-right font-medium">Кол-во</th>
                  <th className="py-2 px-3 text-right font-medium">Цена</th>
                  <th className="py-2 pl-3 text-right font-medium">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {order.plants.map((item, index) => (
                  <tr key={index} className="border-b border-border">
                    <td className="py-2 pr-3 text-heading">{item.name}</td>
                    <td className="py-2 px-3 text-right text-text">{item.quantity}</td>
                    <td className="py-2 px-3 text-right text-text">
                      {formatMoney(item.unitPriceMinor)}
                    </td>
                    <td className="py-2 pl-3 text-right text-heading">
                      {formatMoney(item.unitPriceMinor * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Money breakdown */}
          <section className="flex flex-col gap-1 self-end text-[15px]">
            <Total label="Сумма растений" value={getSubtotalMinor(order)} />
            <Total label="Доставка" value={order.deliveryPriceMinor} />
            <div className="mt-1 flex justify-between gap-8 border-t border-border pt-2 font-semibold text-heading">
              <span>Итого</span>
              <span>{formatMoney(getTotalMinor(order))}</span>
            </div>
          </section>
        </div>
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

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-8 text-text">
      <span>{label}</span>
      <span className="text-heading">{formatMoney(value)}</span>
    </div>
  )
}

export default OrderDetailPage
