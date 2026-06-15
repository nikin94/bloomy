import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchOrder, updateOrder } from '../../firebase/orders'
import { fetchCustomer } from '../../firebase/customers'
import { formatDate, formatMoney } from '../../utils/format'
import {
  getSubtotalMinor,
  getTotalMinor,
  DELIVERY_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_OPTIONS,
  SHIPMENT_STATUS_OPTIONS,
} from '../../types/order'
import { useAuth } from '../../context/authContext'
import Spinner from '../../components/Spinner/Spinner'
import Select from '../../components/Select/Select'
import Button from '../../components/Button/Button'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

const OrderDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const ownerId = user?.uid
  const [order, setOrder] = useState<Order | null>(null)
  // Resolved live from the customers collection. Stays null when the customer
  // was deleted (a dangling customerId must not crash the page).
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Surfaced when an inline status save fails (the optimistic change is rolled
  // back); kept separate from the page-load error, which replaces the whole body.
  const [statusError, setStatusError] = useState<string | null>(null)
  const [savingStatus, setSavingStatus] = useState(false)

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

  // Save a single status change inline, optimistically: update the local order
  // right away so the UI feels instant, then write the whole order (updateOrder
  // overwrites in place, preserving id/number/dateCreated). On failure roll the
  // value back and surface the error, so the screen never shows an unsaved state.
  const saveStatus = async (patch: Partial<Order>) => {
    if (!order) return
    const previous = order
    const next = { ...order, ...patch }
    setOrder(next)
    setStatusError(null)
    setSavingStatus(true)
    try {
      const { id, ...stored } = next
      await updateOrder(next.id, stored)
    } catch (err: unknown) {
      setOrder(previous)
      setStatusError(err instanceof Error ? err.message : 'Не удалось сохранить статус')
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <div className="overflow-auto p-6">
      <Link to="/orders" className="mb-4 inline-block text-primary no-underline hover:underline">
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
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="m-0 text-2xl font-semibold text-heading">
              Заказ №{order.number}
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-text">{formatDate(order.dateCreated)}</span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/orders/${order.id}/edit`)}
              >
                Редактировать
              </Button>
            </div>
          </header>

          {statusError && (
            <p role="alert" className="m-0 text-danger">
              {statusError}
            </p>
          )}

          {/* General info. The two statuses are editable inline (the frequent
              "mark paid/shipped" action) without opening the full edit form;
              the rest is read-only and changed via "Редактировать". */}
          <section className="flex flex-col">
            <Field label="Клиент" value={customer?.name ?? '—'} />
            {customer?.phone && <Field label="Телефон" value={customer.phone} />}
            <Field label="Адрес доставки" value={order.address || '—'} />
            <Field label="Способ доставки" value={DELIVERY_METHOD_LABELS[order.deliveryMethod]} />
            <Field label="Способ оплаты" value={PAYMENT_METHOD_LABELS[order.paymentMethod]} />
            <InlineStatusField
              label="Статус оплаты"
              value={order.paymentStatus}
              options={PAYMENT_STATUS_OPTIONS}
              disabled={savingStatus}
              onChange={(value) => saveStatus({ paymentStatus: value as Order['paymentStatus'] })}
            />
            <InlineStatusField
              label="Статус отправки"
              value={order.shipmentStatus}
              options={SHIPMENT_STATUS_OPTIONS}
              disabled={savingStatus}
              onChange={(value) => saveStatus({ shipmentStatus: value as Order['shipmentStatus'] })}
            />
            {order.comment && <Field label="Комментарий" value={order.comment} />}
          </section>

          {/* Itemized plant list */}
          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-lg font-semibold text-heading">Растения</h2>
            <table className="w-full border-collapse text-[0.8333rem]">
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
          <section className="flex flex-col gap-1 self-end text-[0.8333rem]">
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

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-3 border-b border-border py-2">
    <span className="shrink-0 basis-[200px] text-text">{label}</span>
    <span className="text-heading">{value}</span>
  </div>
)

// A status row that's editable in place: same layout as Field, but the value is
// a Select. Selecting an option calls onChange, which saves optimistically on
// the page. Disabled while a save is in flight. Used for both order statuses.
const InlineStatusField = ({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  disabled: boolean
  onChange: (value: string) => void
}) => (
  <div className="flex items-center gap-3 border-b border-border py-2">
    <span className="shrink-0 basis-[200px] text-text">{label}</span>
    <div className="min-w-0 max-w-[220px] flex-1">
      <Select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  </div>
)

const Total = ({ label, value }: { label: string; value: number }) => (
  <div className="flex justify-between gap-8 text-text">
    <span>{label}</span>
    <span className="text-heading">{formatMoney(value)}</span>
  </div>
)

export default OrderDetailPage
