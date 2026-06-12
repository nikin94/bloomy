import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../../components/AppHeader/AppHeader'
import { createOrder } from '../../lib/orders'
import { formatMoney, parseRublesToMinor } from '../../lib/format'
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  SHIPMENT_STATUS_OPTIONS,
} from '../../types/order'
import type { NewOrder } from '../../lib/orders'
import type { OrderItem, PaymentMethod, PaymentStatus, ShipmentStatus } from '../../types/order'

// Item row as entered in the form. Numeric fields are kept as strings while
// editing (controlled inputs) and parsed into the stored model on submit.
interface ItemInput {
  id: number // stable React key, independent of array position
  name: string
  quantity: string
  price: string // rubles, e.g. "149,90"
}

const emptyItem = (id: number): ItemInput => ({ id, name: '', quantity: '1', price: '' })

// Width is intentionally NOT baked in here: in the generated Tailwind CSS
// `.w-full` is emitted after `.w-20`/`.w-28`, so baking `w-full` in would win
// over per-field width overrides (equal specificity → later rule wins) and
// blow out the plant row. Each usage sets its own width instead.
const fieldClass =
  'rounded-md border border-border bg-bg px-3 py-2 text-heading ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-accent'

function NewOrderPage() {
  const navigate = useNavigate()

  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  // Monotonic id source for item rows, so React keys stay stable across
  // add/remove instead of being tied to array position. The first row is
  // seeded with id 0; the ref hands out 1, 2, … for rows added later.
  const itemIdRef = useRef(0)
  const nextItemId = () => (itemIdRef.current += 1)
  const [items, setItems] = useState<ItemInput[]>(() => [emptyItem(0)])
  const [deliveryPrice, setDeliveryPrice] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending')
  const [shipmentStatus, setShipmentStatus] = useState<ShipmentStatus>('new')
  const [comment, setComment] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateItem = (index: number, patch: Partial<ItemInput>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }
  const addItem = () => setItems((prev) => [...prev, emptyItem(nextItemId())])
  const removeItem = (index: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))

  // Live preview of the derived totals (same money model as the order itself).
  const subtotalMinor = items.reduce(
    (sum, item) => sum + parseRublesToMinor(item.price) * (Number(item.quantity) || 0),
    0,
  )
  const totalMinor = subtotalMinor + parseRublesToMinor(deliveryPrice)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setError(null)

    const plants: OrderItem[] = items
      .filter((item) => item.name.trim() !== '')
      .map((item) => ({
        name: item.name.trim(),
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
        unitPriceMinor: parseRublesToMinor(item.price),
      }))

    if (customerName.trim() === '') {
      setError('Укажите имя заказчика')
      return
    }
    if (plants.length === 0) {
      setError('Добавьте хотя бы одно растение')
      return
    }

    const order: NewOrder = {
      dateCreated: Date.now(),
      customerName: customerName.trim(),
      address: address.trim(),
      plants,
      paymentMethod,
      deliveryPriceMinor: parseRublesToMinor(deliveryPrice),
      currency: 'RUB',
      paymentStatus,
      shipmentStatus,
      ...(comment.trim() !== '' ? { comment: comment.trim() } : {}),
    }

    setSaving(true)
    try {
      const id = await createOrder(order)
      navigate(`/orders/${id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить заказ')
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader />

      <div className="overflow-auto p-6">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl flex-col gap-5">
          <h1 className="m-0 text-[22px] font-semibold text-heading">Новый заказ</h1>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text">Заказчик</span>
            <input
              className={`${fieldClass} w-full`}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text">Адрес</span>
            <input
              className={`${fieldClass} w-full`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>

          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 p-0 text-sm text-text">Растения</legend>
            {items.map((item, index) => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  className={`${fieldClass} min-w-0 flex-1`}
                  placeholder="Название"
                  value={item.name}
                  onChange={(e) => updateItem(index, { name: e.target.value })}
                />
                <input
                  className={`${fieldClass} w-20 shrink-0`}
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Кол-во"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: e.target.value })}
                />
                <input
                  className={`${fieldClass} w-28 shrink-0`}
                  inputMode="decimal"
                  placeholder="Цена, ₽"
                  value={item.price}
                  onChange={(e) => updateItem(index, { price: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  aria-label="Удалить растение"
                  className="shrink-0 rounded-md border border-border px-3 py-2 text-text transition-colors hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addItem}
              className="self-start rounded-md border border-border px-3 py-2 text-sm text-heading transition-colors hover:bg-accent-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              + Добавить растение
            </button>
          </fieldset>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text">Стоимость доставки, ₽</span>
            <input
              className={`${fieldClass} w-full max-w-40`}
              inputMode="decimal"
              placeholder="0"
              value={deliveryPrice}
              onChange={(e) => setDeliveryPrice(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-text">Оплата</span>
              <select
                className={`${fieldClass} w-full`}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-text">Статус оплаты</span>
              <select
                className={`${fieldClass} w-full`}
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
              >
                {PAYMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-text">Отправка</span>
              <select
                className={`${fieldClass} w-full`}
                value={shipmentStatus}
                onChange={(e) => setShipmentStatus(e.target.value as ShipmentStatus)}
              >
                {SHIPMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text">Комментарий</span>
            <textarea
              className={`${fieldClass} w-full min-h-20 resize-y`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>

          <div className="flex items-center justify-between border-t border-border pt-4 text-heading">
            <span className="text-sm text-text">Итого</span>
            <span className="text-lg font-semibold">{formatMoney(totalMinor)}</span>
          </div>

          {error && (
            <p role="alert" className="m-0 text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-accent px-5 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {saving ? 'Сохранение…' : 'Сохранить заказ'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/orders')}
              className="rounded-md border border-border px-5 py-2 text-heading transition-colors hover:bg-accent-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NewOrderPage
