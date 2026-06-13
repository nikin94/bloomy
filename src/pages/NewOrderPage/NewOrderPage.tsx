import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../../components/AppHeader/AppHeader'
import { createOrder } from '../../lib/orders'
import { createCustomer, fetchCustomers } from '../../lib/customers'
import { CURRENT_OWNER_ID } from '../../lib/owner'
import { formatMoney, parseRublesToMinor } from '../../lib/format'
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  SHIPMENT_STATUS_OPTIONS,
} from '../../types/order'
import type { NewOrder } from '../../lib/orders'
import type { OrderItem, PaymentMethod, PaymentStatus, ShipmentStatus } from '../../types/order'
import type { Customer, NewCustomer } from '../../types/customer'

// Item row as entered in the form. Numeric fields are kept as strings while
// editing (controlled inputs) and parsed into the stored model on submit.
interface ItemInput {
  id: number // stable React key, independent of array position
  name: string
  quantity: string
  price: string // rubles, e.g. "149,90"
}

const emptyItem = (id: number): ItemInput => ({ id, name: '', quantity: '1', price: '' })

// Pick an existing customer from the address book, or enter a new one.
type CustomerMode = 'existing' | 'new'

// Width is intentionally NOT baked in here: in the generated Tailwind CSS
// `.w-full` is emitted after `.w-20`/`.w-28`, so baking `w-full` in would win
// over per-field width overrides (equal specificity → later rule wins) and
// blow out the plant row. Each usage sets its own width instead.
const fieldClass =
  'rounded-md border border-border bg-bg px-3 py-2 text-heading ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-accent'

function NewOrderPage() {
  const navigate = useNavigate()

  // Customer selection. Defaults to "new"; switches to "existing" once the
  // address book turns out to be non-empty (returning users get the picker).
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerMode, setCustomerMode] = useState<CustomerMode>('new')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newNote, setNewNote] = useState('')

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

  useEffect(() => {
    let active = true
    fetchCustomers(CURRENT_OWNER_ID)
      .then((data) => {
        if (!active) return
        setCustomers(data)
        if (data.length > 0) setCustomerMode('existing')
      })
      .catch(() => {
        // Non-fatal: the picker just stays empty and the user adds a new
        // customer. Order-save errors are surfaced separately.
      })
    return () => {
      active = false
    }
  }, [])

  const updateItem = (index: number, patch: Partial<ItemInput>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }
  const addItem = () => setItems((prev) => [...prev, emptyItem(nextItemId())])
  const removeItem = (index: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))

  const selectCustomer = (id: string) => {
    setSelectedCustomerId(id)
    // Prefill the delivery address from the customer's default, if any.
    const customer = customers.find((c) => c.id === id)
    if (customer?.address) setAddress(customer.address)
  }

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

    if (customerMode === 'existing' && selectedCustomerId === '') {
      setError('Выберите клиента')
      return
    }
    if (customerMode === 'new' && newName.trim() === '') {
      setError('Укажите имя клиента')
      return
    }
    if (plants.length === 0) {
      setError('Добавьте хотя бы одно растение')
      return
    }

    setSaving(true)
    try {
      // Resolve the customer id: reuse the selected one, or create a new
      // customer first. The delivery address also seeds the new customer's
      // default address.
      let customerId = selectedCustomerId
      if (customerMode === 'new') {
        const newCustomer: NewCustomer = {
          ownerId: CURRENT_OWNER_ID,
          name: newName.trim(),
          createdAt: Date.now(),
          ...(newPhone.trim() !== '' ? { phone: newPhone.trim() } : {}),
          ...(newNote.trim() !== '' ? { note: newNote.trim() } : {}),
          ...(address.trim() !== '' ? { address: address.trim() } : {}),
        }
        customerId = await createCustomer(newCustomer)
        // The customer document now exists. If createOrder below fails and the
        // user retries, switch to the "existing" branch so we reuse this id
        // instead of creating a duplicate customer on every retry.
        setSelectedCustomerId(customerId)
        setCustomerMode('existing')
      }

      const order: NewOrder = {
        dateCreated: Date.now(),
        ownerId: CURRENT_OWNER_ID,
        customerId,
        address: address.trim(),
        plants,
        paymentMethod,
        deliveryPriceMinor: parseRublesToMinor(deliveryPrice),
        currency: 'RUB',
        paymentStatus,
        shipmentStatus,
        ...(comment.trim() !== '' ? { comment: comment.trim() } : {}),
      }

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

          <fieldset className="flex flex-col gap-3 border-0 p-0">
            <legend className="mb-1 p-0 text-sm text-text">Клиент</legend>

            {/* Segmented slider toggle. Native radios stay as the source of
                truth (keyboard + form semantics) but are visually hidden; the
                sliding pill is positioned from `customerMode`. */}
            <div
              role="radiogroup"
              aria-label="Тип клиента"
              className="relative grid w-full max-w-xs grid-cols-2 rounded-full border border-border bg-accent-bg p-1 text-sm font-medium"
            >
              {/* Sliding pill behind the active segment. */}
              <span
                aria-hidden="true"
                className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-accent shadow-sm transition-transform duration-200 ease-out ${
                  customerMode === 'new' ? 'translate-x-full' : 'translate-x-0'
                }`}
              />
              <label
                className={`relative z-10 flex cursor-pointer items-center justify-center rounded-full py-1.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                  customerMode === 'existing' ? 'text-white' : 'text-text hover:text-heading'
                } ${customers.length === 0 ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <input
                  type="radio"
                  name="customerMode"
                  className="sr-only"
                  checked={customerMode === 'existing'}
                  onChange={() => setCustomerMode('existing')}
                  disabled={customers.length === 0}
                />
                Существующий
              </label>
              <label
                className={`relative z-10 flex cursor-pointer items-center justify-center rounded-full py-1.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                  customerMode === 'new' ? 'text-white' : 'text-text hover:text-heading'
                }`}
              >
                <input
                  type="radio"
                  name="customerMode"
                  className="sr-only"
                  checked={customerMode === 'new'}
                  onChange={() => setCustomerMode('new')}
                />
                Новый
              </label>
            </div>

            {customerMode === 'existing' ? (
              customers.length === 0 ? (
                <p className="m-0 text-sm text-text">
                  Нет сохранённых клиентов — добавьте нового.
                </p>
              ) : (
                <select
                  className={`${fieldClass} w-full`}
                  aria-label="Существующий клиент"
                  value={selectedCustomerId}
                  onChange={(e) => selectCustomer(e.target.value)}
                >
                  <option value="">— выберите клиента —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.phone ? `${c.name} (${c.phone})` : c.name}
                    </option>
                  ))}
                </select>
              )
            ) : (
              <div className="flex flex-col gap-3">
                <input
                  className={`${fieldClass} w-full`}
                  aria-label="Имя клиента"
                  placeholder="Имя*"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <input
                  className={`${fieldClass} w-full`}
                  aria-label="Телефон"
                  placeholder="Телефон"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
                <textarea
                  className={`${fieldClass} min-h-16 w-full resize-y`}
                  aria-label="Заметка о клиенте"
                  placeholder="Заметка"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
              </div>
            )}
          </fieldset>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text">Адрес доставки</span>
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
              className={`${fieldClass} min-h-20 w-full resize-y`}
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
