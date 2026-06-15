import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../../components/AppHeader/AppHeader'
import { createOrder } from '../../lib/orders'
import { createCustomer, fetchCustomers } from '../../lib/customers'
import { useAuth } from '../../context/auth-context'
import { formatMoney, parseRublesToMinor } from '../../lib/format'
import {
  DELIVERY_METHOD_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  SHIPMENT_STATUS_OPTIONS,
} from '../../types/order'
import Spinner from '../../components/Spinner/Spinner'
import Select from '../../components/Select/Select'
import type { NewOrder } from '../../lib/orders'
import type {
  DeliveryMethod,
  OrderItem,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
} from '../../types/order'
import type { Customer, NewCustomer } from '../../types/customer'

// Item row as entered in the form. Numeric fields are kept as strings while
// editing (controlled inputs) and parsed into the stored model on submit.
interface ItemInput {
  id: number // stable React key, independent of array position
  name: string
  quantity: string
  price: string // rubles, e.g. "149,90"
}

// Quantity starts empty (not "1") so the field reads as blank; a blank quantity
// is treated as 1 both in the live total below and when the order is saved.
const emptyItem = (id: number): ItemInput => ({ id, name: '', quantity: '', price: '' })

// Constrain the price field to a valid ruble amount as the user types: digits
// and a single decimal separator (comma or dot), at most two fractional digits.
// Any other character (letters, a second separator) is dropped, so the field can
// never hold a non-numeric value — gentler than rejecting the keystroke outright.
const sanitizePrice = (value: string): string => {
  const [intPart = '', sep = '', fracPart = ''] =
    value.replace(/[^\d.,]/g, '').match(/^(\d*)([.,]?)(\d*)/)?.slice(1) ?? []
  return sep ? `${intPart}${sep}${fracPart.slice(0, 2)}` : intPart
}

// Pick an existing customer from the address book, or enter a new one.
type CustomerMode = 'existing' | 'new'

// Validation message shown when no existing customer is picked. Kept as a
// constant so selecting a customer can clear exactly this error and nothing else.
const SELECT_CUSTOMER_ERROR = 'Выберите клиента'

// Width is intentionally NOT baked in here: in the generated Tailwind CSS
// `.w-full` is emitted after `.w-20`/`.w-28`, so baking `w-full` in would win
// over per-field width overrides (equal specificity → later rule wins) and
// blow out the plant row. Each usage sets its own width instead.
const fieldClass =
  'rounded-md border border-border bg-bg px-3 py-2 text-heading ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-accent'

// One editable plant line, prefixed with its 1-based position. Four controls
// (name, quantity, price, delete) don't fit a phone width in a single row, so on
// narrow screens the number+name take their own line and quantity/price/delete
// share the line below; from `sm` up they all sit in one row. Widths are fluid
// at every size — the two groups distribute the row via flex proportions and the
// inputs carry `min-w-0` so they shrink with the container instead of locking to
// a fixed width. Extracted from the map so the loop body is its own component.
const PlantItemRow = ({
  position,
  item,
  priceMissing,
  canRemove,
  onChange,
  onRemove,
}: {
  position: number
  item: ItemInput
  priceMissing: boolean
  canRemove: boolean
  onChange: (patch: Partial<ItemInput>) => void
  onRemove: () => void
}) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
    <div className="flex min-w-0 items-center gap-2 sm:flex-[4]">
      <span aria-hidden="true" className="w-5 shrink-0 text-right text-sm text-text">
        {position}.
      </span>
      <input
        className={`${fieldClass} min-w-0 flex-1`}
        placeholder="Название"
        value={item.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
    </div>
    <div className="flex min-w-0 items-center gap-2 sm:flex-[3]">
      <input
        className={`${fieldClass} min-w-0 flex-1`}
        type="number"
        min={1}
        step={1}
        placeholder="Кол-во"
        value={item.quantity}
        onChange={(e) => onChange({ quantity: e.target.value })}
      />
      <input
        // Border colour is set explicitly (danger vs normal) instead of
        // overriding the shared field class, so only one border-* colour utility
        // is ever present (avoids order-dependent wins).
        className={`min-w-0 flex-[2] rounded-md border bg-bg px-3 py-2 text-heading focus-visible:outline-2 focus-visible:outline-offset-[-1px] ${
          priceMissing
            ? 'border-danger focus-visible:outline-danger'
            : 'border-border focus-visible:outline-accent'
        }`}
        inputMode="decimal"
        placeholder="Цена, ₽"
        aria-invalid={priceMissing}
        value={item.price}
        onChange={(e) => onChange({ price: sanitizePrice(e.target.value) })}
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label="Удалить растение"
        className="shrink-0 rounded-md border border-border px-3 py-2 text-text transition-colors hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        ✕
      </button>
    </div>
  </div>
)

function NewOrderPage() {
  const navigate = useNavigate()
  // Owner of every record created here. Guaranteed non-null under ProtectedRoute.
  const { user } = useAuth()
  const ownerId = user?.uid

  // Customer selection. Defaults to "new"; switches to "existing" once the
  // address book turns out to be non-empty (returning users get the picker).
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerMode, setCustomerMode] = useState<CustomerMode>('new')
  // Gate the form on the customer fetch: the initial mode depends on whether the
  // address book is empty, so rendering the form before it resolves would paint
  // the slider at "new" and snap it to "existing" once the data arrives. Showing
  // the spinner until then means the form first paints with the mode correct.
  const [customersLoading, setCustomersLoading] = useState(true)
  // The slider pill only animates after the user interacts. The initial
  // fetch-driven switch to "existing" (for returning users) must not slide.
  const [animateModeSlider, setAnimateModeSlider] = useState(false)
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
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('post')
  const [deliveryPrice, setDeliveryPrice] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending')
  const [shipmentStatus, setShipmentStatus] = useState<ShipmentStatus>('new')
  const [comment, setComment] = useState('')

  const [saving, setSaving] = useState(false)
  // Becomes true on the first submit attempt; until then, incomplete-row hints
  // (e.g. a named plant without a price) stay hidden so the form doesn't nag
  // while the user is still filling it in.
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ownerId) return
    let active = true
    fetchCustomers(ownerId)
      .then((data) => {
        if (!active) return
        setCustomers(data)
        if (data.length > 0) setCustomerMode('existing')
      })
      .catch(() => {
        // Non-fatal: the picker just stays empty and the user adds a new
        // customer. Order-save errors are surfaced separately.
      })
      .finally(() => {
        if (active) setCustomersLoading(false)
      })
    return () => {
      active = false
    }
  }, [ownerId])

  const updateItem = (index: number, patch: Partial<ItemInput>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }
  // Allow adding a new row only when the last one has a name — otherwise the
  // user could pile up empty rows. Empty rows are also dropped on submit.
  const lastItem = items[items.length - 1]
  const canAddItem = lastItem !== undefined && lastItem.name.trim() !== ''
  const addItem = () => {
    if (!canAddItem) return
    setItems((prev) => [...prev, emptyItem(nextItemId())])
  }
  const removeItem = (index: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))

  // A row that has a name but no price is incomplete — flag its price input, but
  // only after a submit attempt so the field doesn't turn red while the user is
  // still typing. The trailing empty placeholder (no name yet) is never flagged.
  const isPriceMissing = (item: ItemInput) =>
    submitAttempted && item.name.trim() !== '' && item.price.trim() === ''

  // Single source of truth for prefilling order fields from an existing
  // customer. Pass the customer to fill, or undefined to clear. Every field that
  // is derived from the customer must be set here (and only here) so that adding
  // a new prefilled field stays a one-line change covered by all entry points:
  // picking a customer, clearing the picker, and toggling the mode slider.
  const applyCustomerToForm = (customer: Customer | undefined) => {
    setAddress(customer?.address ?? '')
  }

  const selectCustomer = (id: string) => {
    setSelectedCustomerId(id)
    // Reset prefilled fields, then fill from the newly picked customer. Always
    // resetting first means a previous customer's data can't linger when the new
    // pick (or the "— выберите клиента —" placeholder, id === '') lacks it.
    applyCustomerToForm(customers.find((c) => c.id === id))
    // Picking a real customer clears the "select a customer" validation error.
    if (id !== '') setError((prev) => (prev === SELECT_CUSTOMER_ERROR ? null : prev))
  }

  const selectMode = (mode: CustomerMode) => {
    setAnimateModeSlider(true)
    setCustomerMode(mode)
    // "new" starts a fresh customer → clear prefilled fields. "existing" re-syncs
    // the form with the still-selected customer (the "new" branch cleared it).
    applyCustomerToForm(
      mode === 'new' ? undefined : customers.find((c) => c.id === selectedCustomerId),
    )
  }

  // Live preview of the derived totals (same money model as the order itself).
  const subtotalMinor = items.reduce(
    // A blank/zero quantity counts as 1 here, matching what gets saved.
    (sum, item) => sum + parseRublesToMinor(item.price) * (Number(item.quantity) || 1),
    0,
  )
  const totalMinor = subtotalMinor + parseRublesToMinor(deliveryPrice)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSubmitAttempted(true)
    setError(null)

    if (!ownerId) {
      setError('Сессия истекла — войдите снова')
      return
    }

    const plants: OrderItem[] = items
      .filter((item) => item.name.trim() !== '')
      .map((item) => ({
        name: item.name.trim(),
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
        unitPriceMinor: parseRublesToMinor(item.price),
      }))

    if (customerMode === 'existing' && selectedCustomerId === '') {
      setError(SELECT_CUSTOMER_ERROR)
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
    // A named plant with no price is incomplete — block the save (the matching
    // price input is already flagged red via isPriceMissing).
    if (items.some((item) => item.name.trim() !== '' && item.price.trim() === '')) {
      setError('Укажите цену для каждого растения')
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
          ownerId,
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
        ownerId,
        customerId,
        address: address.trim(),
        plants,
        paymentMethod,
        deliveryMethod,
        deliveryPriceMinor: parseRublesToMinor(deliveryPrice),
        currency: 'RUB',
        paymentStatus,
        shipmentStatus,
        ...(comment.trim() !== '' ? { comment: comment.trim() } : {}),
      }

      const id = await createOrder(order)
      // Go to the list (not the order page) and pass the new id so the list can
      // briefly highlight the freshly created order at the top.
      navigate('/orders', { state: { highlightId: id } })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить заказ')
      setSaving(false)
    }
  }

  // Wait for the customer fetch before painting the form, so the slider starts
  // in the correct position instead of snapping from "new" to "existing".
  if (customersLoading) return <Spinner />

  return (
    <div className="flex h-full flex-col">
      <AppHeader />

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        {/* Scrollable body — the footer below stays pinned. */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
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
                className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-accent shadow-sm ${
                  animateModeSlider ? 'transition-transform duration-200 ease-out' : ''
                } ${customerMode === 'new' ? 'translate-x-full' : 'translate-x-0'}`}
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
                  onChange={() => selectMode('existing')}
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
                  onChange={() => selectMode('new')}
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
                <Select
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
                </Select>
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
              <PlantItemRow
                key={item.id}
                position={index + 1}
                item={item}
                priceMissing={isPriceMissing(item)}
                canRemove={items.length > 1}
                onChange={(patch) => updateItem(index, patch)}
                onRemove={() => removeItem(index)}
              />
            ))}
            <button
              type="button"
              onClick={addItem}
              disabled={!canAddItem}
              className="self-start rounded-md border border-border px-3 py-2 text-sm text-heading transition-colors hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              + Добавить растение
            </button>
          </fieldset>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-text">Способ доставки</span>
              <Select
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value as DeliveryMethod)}
              >
                {DELIVERY_METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-text">Стоимость доставки, ₽</span>
              <input
                className={`${fieldClass} w-full`}
                inputMode="decimal"
                placeholder="0"
                value={deliveryPrice}
                onChange={(e) => setDeliveryPrice(e.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-text">Оплата</span>
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-text">Статус оплаты</span>
              <Select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
              >
                {PAYMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-text">Отправка</span>
              <Select
                value={shipmentStatus}
                onChange={(e) => setShipmentStatus(e.target.value as ShipmentStatus)}
              >
                {SHIPMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
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

          </div>
        </div>

        {/* Pinned footer: the running total and actions stay visible while the
            plant list grows, so the user never has to scroll to see the total. */}
        <div className="border-t border-border bg-bg px-6 py-4">
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {error && (
              <p role="alert" className="m-0 text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-text">Итого</span>
                <span className="text-lg font-semibold text-heading">
                  {formatMoney(totalMinor)}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-accent px-5 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {saving ? 'Сохранение…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/orders')}
                  className="rounded-md border border-border px-5 py-2 text-heading transition-colors hover:bg-accent-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

export default NewOrderPage
