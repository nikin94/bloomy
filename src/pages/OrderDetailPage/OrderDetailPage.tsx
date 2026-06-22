import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchOrder, patchOrder, softDeleteOrder } from '../../firebase/orders'
import type { OrderPatch } from '../../firebase/orders'
import { fetchCustomer, updateCustomer } from '../../firebase/customers'
import type { CustomerEdits } from '../../firebase/customers'
import { formatDate, formatMoney } from '../../utils/format'
import {
  getSubtotalMinor,
  getTotalMinor,
  plantsByValueDesc,
  DELIVERY_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_OPTIONS,
  SHIPMENT_STATUS_OPTIONS,
  resolveCompletedAt,
  formatOrderNumber,
} from '../../types/order'
import { useAuth } from '../../context/authContext'
import Spinner from '../../components/Spinner/Spinner'
import Select from '../../components/Select/Select'
import Button from '../../components/Button/Button'
import Modal from '../../components/Modal/Modal'
import CustomerForm from '../../components/CustomerForm/CustomerForm'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

const EditIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-5"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

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
  // Delete is confirmed in a modal (destructive, so not a one-click action).
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // The customer's name lives on the customer record, not the order, so it's
  // edited here in a dialog (the shared CustomerForm) — fixing it where it's seen
  // rather than sending the user to the customers page.
  const [editingCustomer, setEditingCustomer] = useState(false)

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
  // right away so the UI feels instant, then write ONLY the changed field(s)
  // (patchOrder is a per-field merge, so this inline toggle never clobbers a
  // concurrent edit to another field on another device). The write is fire-and-
  // forget — it never blocks and works offline — so the optimistic value stays
  // and syncs on reconnect; a failed write is reported to Sentry, not rolled back.
  const saveStatus = (patch: Partial<Order>) => {
    if (!order) return
    const next = { ...order, ...patch }
    // The write touches only the fields the caller changed (paymentStatus OR
    // shipmentStatus), so the merge stays field-scoped.
    const writePatch: OrderPatch = {}
    if (patch.paymentStatus !== undefined) writePatch.paymentStatus = patch.paymentStatus
    // Completion is derived from the shipment status: delivered/cancelled stamps
    // the completion time, any other status clears it (null → removed in patchOrder).
    if (patch.shipmentStatus !== undefined) {
      writePatch.shipmentStatus = patch.shipmentStatus
      const completedAt = resolveCompletedAt(next.shipmentStatus, order.completedAt, Date.now())
      if (completedAt === undefined) {
        delete next.completedAt
        writePatch.completedAt = null
      } else {
        next.completedAt = completedAt
        writePatch.completedAt = completedAt
      }
    }
    setOrder(next)
    patchOrder(next.id, writePatch)
  }

  // Persist the customer's edited fields, then mirror them onto the local
  // customer so the page (the "Клиент"/"Телефон" rows) updates live without a
  // refetch. Empty optional fields drop to undefined, matching updateCustomer.
  // updateCustomer is fire-and-forget (offline-safe), so this never blocks and
  // the dialog closes at once; a failed write is reported to Sentry.
  const handleSaveCustomer = async (edits: CustomerEdits) => {
    if (!customer) return
    updateCustomer(customer.id, edits)
    const trimmed = (value: string | undefined) =>
      value && value.trim() !== '' ? value.trim() : undefined
    setCustomer({
      ...customer,
      name: edits.name.trim(),
      phone: trimmed(edits.phone),
      address: trimmed(edits.address),
      note: trimmed(edits.note),
    })
    setEditingCustomer(false)
  }

  // Soft-delete the order, then return to the list (where it no longer appears).
  // The write is fire-and-forget (offline-safe) so deleting never blocks; the
  // order moves to the trash locally at once and syncs on reconnect.
  const handleDelete = () => {
    if (!order) return
    softDeleteOrder(order.id)
    navigate('/orders')
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
              Заказ №{formatOrderNumber(order.number)}
              {order.number === null && (
                <span className="ml-2 align-middle text-sm font-normal text-text">
                  не синхронизирован
                </span>
              )}
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
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmingDelete(true)}
              >
                Удалить
              </Button>
            </div>
          </header>

          {/* General info. The two statuses are editable inline (the frequent
              "mark paid/shipped" action) without opening the full edit form;
              the rest is read-only and changed via "Редактировать". */}
          <section className="flex flex-col">
            <Field
              label="Клиент"
              value={customer?.name ?? '—'}
              action={
                customer ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setEditingCustomer(true)}
                    aria-label="Редактировать клиента"
                    title="Редактировать клиента"
                  >
                    <EditIcon />
                  </Button>
                ) : undefined
              }
            />
            {customer?.phone && <Field label="Телефон" value={customer.phone} />}
            <Field label="Адрес доставки" value={order.address || '—'} />
            <Field label="Способ доставки" value={DELIVERY_METHOD_LABELS[order.deliveryMethod]} />
            <Field label="Способ оплаты" value={PAYMENT_METHOD_LABELS[order.paymentMethod]} />
            <InlineStatusField
              label="Статус оплаты"
              value={order.paymentStatus}
              options={PAYMENT_STATUS_OPTIONS}
              onChange={(value) => saveStatus({ paymentStatus: value as Order['paymentStatus'] })}
            />
            <InlineStatusField
              label="Статус отправки"
              value={order.shipmentStatus}
              options={SHIPMENT_STATUS_OPTIONS}
              onChange={(value) => saveStatus({ shipmentStatus: value as Order['shipmentStatus'] })}
            />
            {order.completedAt && <Field label="Завершён" value={formatDate(order.completedAt)} />}
            {order.comment && <Field label="Комментарий" value={order.comment} />}
          </section>

          {/* Itemized plant list */}
          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-lg font-semibold text-heading">Растения</h2>
            <table className="w-full border-collapse text-[0.8333rem]">
              <thead>
                <tr className="border-b border-border text-left text-sm text-text">
                  <th className="w-8 py-2 pr-3 text-right font-medium tabular-nums">№</th>
                  <th className="py-2 pr-3 font-medium">Название</th>
                  <th className="py-2 px-3 text-right font-medium">Кол-во</th>
                  <th className="py-2 px-3 text-right font-medium">Цена</th>
                  <th className="py-2 pl-3 text-right font-medium">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {plantsByValueDesc(order.plants).map((item, index) => (
                  <tr key={index} className="border-b border-border">
                    <td className="py-2 pr-3 text-right text-text tabular-nums">{index + 1}</td>
                    <td className="py-2 pr-3 text-heading">{item.name}</td>
                    <td className="py-2 px-3 text-right text-text tabular-nums">{item.quantity}</td>
                    <td className="py-2 px-3 text-right text-text tabular-nums">
                      {formatMoney(item.unitPriceMinor)}
                    </td>
                    <td className="py-2 pl-3 text-right text-heading tabular-nums">
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
              <span className="tabular-nums">{formatMoney(getTotalMinor(order))}</span>
            </div>
          </section>
        </div>
      )}

      {editingCustomer && customer && (
        <Modal title="Редактирование клиента" onClose={() => setEditingCustomer(false)}>
          <CustomerForm
            initial={{
              name: customer.name,
              phone: customer.phone,
              address: customer.address,
              note: customer.note,
            }}
            onCancel={() => setEditingCustomer(false)}
            onSubmit={handleSaveCustomer}
          />
        </Modal>
      )}

      {confirmingDelete && order && (
        <Modal
          title={`Удалить заказ №${formatOrderNumber(order.number)}?`}
          onClose={() => setConfirmingDelete(false)}
        >
          <p className="m-0 text-text">Заказ переместится в корзину — его можно будет восстановить.</p>
          <div className="flex justify-end gap-2">
            <Button variant="danger" onClick={handleDelete}>
              Удалить
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Отмена
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// A read-only label/value row. An optional `action` slot (e.g. an edit button)
// is pinned to the row's end — used by the "Клиент" row to edit the customer.
const Field = ({
  label,
  value,
  action,
}: {
  label: string
  value: string
  action?: ReactNode
}) => (
  <div className="flex items-center gap-3 border-b border-border py-2">
    <span className="shrink-0 basis-[200px] text-text">{label}</span>
    <span className="min-w-0 flex-1 text-heading">{value}</span>
    {action}
  </div>
)

// A status row that's editable in place: same layout as Field, but the value is
// a Select. Selecting an option calls onChange, which saves optimistically on
// the page (the write is fire-and-forget, so there's no in-flight disabled
// state). Used for both order statuses.
const InlineStatusField = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) => (
  <div className="flex items-center gap-3 border-b border-border py-2">
    <span className="shrink-0 basis-[200px] text-text">{label}</span>
    <div className="min-w-0 max-w-[220px] flex-1">
      <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
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
    <span className="text-heading tabular-nums">{formatMoney(value)}</span>
  </div>
)

export default OrderDetailPage
