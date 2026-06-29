import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import AppHeader from '../AppHeader/AppHeader'
import { createCustomer, fetchCustomer, fetchCustomers } from '../../firebase/customers'
import { useAuth } from '../../context/authContext'
import { useSettings } from '../../context/settingsContext'
import { formatMinorToInput, formatMoney, parseRublesToMinor } from '../../utils/format'
import {
  currencyOptions,
  deliveryMethodOptions,
  paymentMethodOptions,
  paymentStatusOptions,
  shipmentStatusOptions,
  resolveCompletedAt,
} from '../../types/order'
import Spinner from '../Spinner/Spinner'
import Select from '../Select/Select'
import Button from '../Button/Button'
import Input from '../Input/Input'
import Textarea from '../Textarea/Textarea'
import type { NewOrder } from '../../firebase/orders'
import type {
  Currency,
  DeliveryMethod,
  Order,
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

// Build the editable item rows for the initial state: one blank row when
// creating, or the stored plants converted back to input strings when editing.
// Row ids are the array index, so the id ref continues from there for new rows.
const initialItems = (order: Order | undefined): ItemInput[] =>
  order
    ? order.plants.map((p, id) => ({
        id,
        name: p.name,
        quantity: String(p.quantity),
        price: formatMinorToInput(p.unitPriceMinor),
      }))
    : [emptyItem(0)]


// Pick an existing customer from the address book, or enter a new one.
type CustomerMode = 'existing' | 'new'

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
  autoFocus,
  t,
  onChange,
  onRemove,
}: {
  position: number
  item: ItemInput
  priceMissing: boolean
  canRemove: boolean
  // Passed from the parent (single i18next subscription) so each plant row
  // doesn't open its own useTranslation.
  t: TFunction<['order', 'common']>
  // Focus the name input on mount — set only for a row just added via the
  // "+ Добавить растение" button, so the user can type the name right away.
  autoFocus: boolean
  onChange: (patch: Partial<ItemInput>) => void
  onRemove: () => void
}) => {
  return (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
    <div className="flex min-w-0 items-center gap-2 sm:flex-[4]">
      <span aria-hidden="true" className="w-5 shrink-0 text-right text-sm text-text">
        {position}.
      </span>
      <Input
        className="min-w-0 flex-1"
        label={t('form.plantName')}
        autoFocus={autoFocus}
        value={item.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
    </div>
    <div className="flex min-w-0 items-center gap-2 sm:flex-[3]">
      <Input
        className="min-w-0 flex-[2]"
        numeric="integer"
        label={t('form.quantity')}
        value={item.quantity}
        onChange={(e) => onChange({ quantity: e.target.value })}
      />
      <Input
        className="min-w-0 flex-[3]"
        numeric="decimal"
        label={t('form.price')}
        invalid={priceMissing}
        value={item.price}
        onChange={(e) => onChange({ price: e.target.value })}
      />
      <Button
        variant="secondary"
        size="icon"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={t('form.removePlant')}
        className="shrink-0"
      >
        ✕
      </Button>
    </div>
  </div>
  )
}

interface OrderFormProps {
  // Screen heading, e.g. "Новый заказ" / "Редактирование заказа".
  heading: string
  // When editing, the existing order to prefill every field from. Omitted when
  // creating (the form starts blank). Read once on mount — the caller must load
  // the order before rendering the form, not swap this prop in later.
  initialOrder?: Order
  // Persist the assembled order, then navigate. The form owns customer
  // resolution (creating a new customer when needed) and builds the order
  // payload, but NOT `dateCreated`: the caller owns it so create can stamp
  // `Date.now()` while edit preserves the original. The caller decides how the
  // order is stored (createOrder vs updateOrder) and where to go next. Throwing
  // surfaces the message as a form error and keeps the user on the page — a
  // newly created customer is already switched to the "existing" branch so a
  // retry reuses it instead of duplicating.
  onSubmit: (order: Omit<NewOrder, 'dateCreated'>) => Promise<void>
  // Leave the form without saving (the caller decides where to).
  onCancel: () => void
}

// The order form screen, shared by the create and edit pages. Owns all form
// state and validation; the caller supplies the heading and how a finished order
// is persisted (see OrderFormProps).
const OrderForm = ({ heading, initialOrder, onSubmit, onCancel }: OrderFormProps) => {
  const { t } = useTranslation(['order', 'common'])
  // Order-bound t for the option helpers (typed TFunction<'order'>).
  const { t: tOrder } = useTranslation('order')
  // Owner of every record created here. Guaranteed non-null under ProtectedRoute.
  const { user } = useAuth()
  const ownerId = user?.uid
  // A new order's delivery/payment method starts from the user's saved defaults
  // (set in Settings); an edited order keeps its own stored values.
  const { defaultDeliveryMethod, defaultPaymentMethod, defaultCurrency } = useSettings()

  // Customer selection. New orders default to "new"; an edited order already has
  // a customer, so it starts in "existing" mode with that customer selected.
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerMode, setCustomerMode] = useState<CustomerMode>(initialOrder ? 'existing' : 'new')
  // Gate the form on the customer fetch: the initial mode depends on whether the
  // address book is empty, so rendering the form before it resolves would paint
  // the slider at "new" and snap it to "existing" once the data arrives. Showing
  // the spinner until then means the form first paints with the mode correct.
  const [customersLoading, setCustomersLoading] = useState(true)
  // The slider pill only animates after the user interacts. The initial
  // fetch-driven switch to "existing" (for returning users) must not slide.
  const [animateModeSlider, setAnimateModeSlider] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialOrder?.customerId ?? '')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const [address, setAddress] = useState(initialOrder?.address ?? '')
  // Monotonic id source for item rows, so React keys stay stable across
  // add/remove instead of being tied to array position. Rows are seeded with ids
  // 0..n-1 (see initialItems), so the ref continues from there for rows added later.
  const itemIdRef = useRef(initialOrder ? initialOrder.plants.length - 1 : 0)
  const nextItemId = () => (itemIdRef.current += 1)
  const [items, setItems] = useState<ItemInput[]>(() => initialItems(initialOrder))
  // Id of the row whose name input should grab focus on mount — set when a row
  // is added so the user can type immediately. Null at first render (and after
  // a prefill) so no row steals focus on load.
  const [focusItemId, setFocusItemId] = useState<number | null>(null)
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(
    initialOrder?.deliveryMethod ?? defaultDeliveryMethod,
  )
  const [deliveryPrice, setDeliveryPrice] = useState(
    initialOrder ? formatMinorToInput(initialOrder.deliveryPriceMinor) : '',
  )
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialOrder?.paymentMethod ?? defaultPaymentMethod,
  )
  // A new order starts in the user's default currency; an edited order keeps the
  // currency it was created with (it is fixed per order — no conversion).
  const [currency, setCurrency] = useState<Currency>(initialOrder?.currency ?? defaultCurrency)
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    initialOrder?.paymentStatus ?? 'pending',
  )
  const [shipmentStatus, setShipmentStatus] = useState<ShipmentStatus>(
    initialOrder?.shipmentStatus ?? 'new',
  )
  const [comment, setComment] = useState(initialOrder?.comment ?? '')

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
      .then(async (data) => {
        if (!active) return
        // When editing an order whose customer was soft-deleted, that customer
        // is absent from the active list — so the picker would drop the current
        // selection. Fetch it directly and keep it in the options (labelled
        // "(удалён)") so the order stays linked to it unless the user changes it.
        const editedId = initialOrder?.customerId
        let list = data
        if (editedId && !data.some((c) => c.id === editedId)) {
          const deleted = await fetchCustomer(editedId)
          if (!active) return
          if (deleted) list = [...data, deleted]
        }
        setCustomers(list)
        if (list.length > 0) setCustomerMode('existing')
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
  }, [ownerId, initialOrder])

  const updateItem = (index: number, patch: Partial<ItemInput>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }
  // Allow adding a new row only when the last one has a name — otherwise the
  // user could pile up empty rows. Empty rows are also dropped on submit.
  const lastItem = items[items.length - 1]
  const canAddItem = lastItem !== undefined && lastItem.name.trim() !== ''
  const addItem = () => {
    if (!canAddItem) return
    const id = nextItemId()
    setItems((prev) => [...prev, emptyItem(id)])
    setFocusItemId(id) // focus the new row's name input once it mounts
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
    if (id !== '') setError((prev) => (prev === t('form.errors.selectCustomer') ? null : prev))
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
      setError(t('form.errors.session'))
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
      setError(t('form.errors.selectCustomer'))
      return
    }
    if (customerMode === 'new' && newName.trim() === '') {
      setError(t('form.errors.customerName'))
      return
    }
    if (plants.length === 0) {
      setError(t('form.errors.noPlants'))
      return
    }
    // A named plant with no price is incomplete — block the save (the matching
    // price input is already flagged red via isPriceMissing).
    if (items.some((item) => item.name.trim() !== '' && item.price.trim() === '')) {
      setError(t('form.errors.plantPrice'))
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
          ...(address.trim() !== '' ? { address: address.trim() } : {}),
        }
        customerId = await createCustomer(newCustomer)
        // The customer document now exists. If the save below fails and the user
        // retries, switch to the "existing" branch so we reuse this id instead
        // of creating a duplicate customer on every retry.
        setSelectedCustomerId(customerId)
        setCustomerMode('existing')
      }

      // Completion stamp derived from the chosen status (e.g. creating or
      // editing an order straight into "delivered"); a re-save keeps the
      // original moment via the order's existing completedAt.
      const completedAt = resolveCompletedAt(shipmentStatus, initialOrder?.completedAt, Date.now())

      // `dateCreated` is set by the caller (Date.now() on create, original on
      // edit), so it is intentionally absent here.
      const order: Omit<NewOrder, 'dateCreated'> = {
        ownerId,
        customerId,
        address: address.trim(),
        plants,
        paymentMethod,
        deliveryMethod,
        deliveryPriceMinor: parseRublesToMinor(deliveryPrice),
        currency,
        paymentStatus,
        shipmentStatus,
        ...(comment.trim() !== '' ? { comment: comment.trim() } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
      }

      // The caller persists the order (create vs update) and navigates.
      await onSubmit(order)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('form.errors.saveFailed'))
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
            <h1 className="m-0 text-[1.2222rem] font-semibold text-heading">{heading}</h1>

          <fieldset className="flex min-w-0 flex-col gap-3 border-0 p-0">
            <legend className="mb-1 p-0 text-sm text-text">{t('form.customer')}</legend>

            {/* Segmented slider toggle. Native radios stay as the source of
                truth (keyboard + form semantics) but are visually hidden; the
                sliding pill is positioned from `customerMode`. */}
            <div
              role="radiogroup"
              aria-label={t('form.customerType')}
              className="relative grid w-full max-w-xs grid-cols-2 rounded-full border border-border bg-primary-bg p-1 text-sm font-medium"
            >
              {/* Sliding pill behind the active segment. */}
              <span
                aria-hidden="true"
                className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary shadow-sm ${
                  animateModeSlider ? 'transition-transform duration-200 ease-out' : ''
                } ${customerMode === 'new' ? 'translate-x-full' : 'translate-x-0'}`}
              />
              <label
                className={`relative z-10 flex min-w-0 cursor-pointer items-center justify-center rounded-full px-2 py-1.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
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
                {/* truncate (with min-w-0 on the label) keeps a long label like
                    "Существующий" inside its segment instead of overflowing. */}
                <span className="min-w-0 truncate">{t('form.existing')}</span>
              </label>
              <label
                className={`relative z-10 flex min-w-0 cursor-pointer items-center justify-center rounded-full px-2 py-1.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
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
                <span className="min-w-0 truncate">{t('form.new')}</span>
              </label>
            </div>

            {customerMode === 'existing' ? (
              customers.length === 0 ? (
                <p className="m-0 text-sm text-text">{t('form.noCustomers')}</p>
              ) : (
                <Select
                  label={t('form.existingCustomer')}
                  value={selectedCustomerId}
                  onChange={(e) => selectCustomer(e.target.value)}
                >
                  <option value="">{t('form.selectCustomer')}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.phone ? `${c.name} (${c.phone})` : c.name}
                      {c.isDeleted ? t('form.deletedSuffix') : ''}
                    </option>
                  ))}
                </Select>
              )
            ) : (
              <div className="flex flex-col gap-3">
                <Input
                  className="w-full"
                  label={t('form.customerName')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Input
                  className="w-full"
                  label={t('form.phone')}
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
            )}
          </fieldset>

          <Input
            className="w-full"
            label={t('form.deliveryAddress')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          {/* The plant list is set off by a divider above and below instead of a
              text heading. The legend is kept sr-only so the group still has an
              accessible name. min-w-0 defeats the fieldset UA `min-inline-size:
              min-content`, which otherwise stops the element from shrinking to its
              flex parent and lets a tight row overflow to the right. */}
          <span aria-hidden="true" className="h-px w-full bg-border" />
          <fieldset className="flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="sr-only">{t('form.plants')}</legend>
            {items.map((item, index) => (
              <PlantItemRow
                key={item.id}
                position={index + 1}
                item={item}
                priceMissing={isPriceMissing(item)}
                canRemove={items.length > 1}
                autoFocus={item.id === focusItemId}
                t={t}
                onChange={(patch) => updateItem(index, patch)}
                onRemove={() => removeItem(index)}
              />
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={addItem}
              disabled={!canAddItem}
              className="self-start"
            >
              {t('form.addPlant')}
            </Button>
          </fieldset>
          <span aria-hidden="true" className="h-px w-full bg-border" />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Select
              label={t('form.deliveryMethod')}
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value as DeliveryMethod)}
            >
              {deliveryMethodOptions(tOrder).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>

            <Input
              className="w-full"
              numeric="decimal"
              label={t('form.deliveryPrice')}
              value={deliveryPrice}
              onChange={(e) => setDeliveryPrice(e.target.value)}
            />

            {/* Currency governs every amount in the order (plant prices, delivery,
                total). Each option shows the localized name plus its symbol. */}
            <Select
              label={t('form.currency')}
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              {currencyOptions(tOrder).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Select
              label={t('form.paymentMethod')}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              {paymentMethodOptions(tOrder).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>

            <Select
              label={t('form.paymentStatus')}
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
            >
              {paymentStatusOptions(tOrder).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>

            <Select
              label={t('form.shipmentStatus')}
              value={shipmentStatus}
              onChange={(e) => setShipmentStatus(e.target.value as ShipmentStatus)}
            >
              {shipmentStatusOptions(tOrder).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          <Textarea
            className="min-h-20 w-full"
            label={t('form.comment')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

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
                <span className="text-sm text-text">{t('form.total')}</span>
                <span className="text-lg font-semibold text-heading">
                  {formatMoney(totalMinor, currency)}
                </span>
              </div>
              {/* Stack the actions full-width on narrow screens; lay them out in
                  a row from `sm` up. */}
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={saving}
                  className="w-full sm:w-auto"
                >
                  {t('common:save')}
                </Button>
                <Button variant="secondary" onClick={onCancel} className="w-full sm:w-auto">
                  {t('common:cancel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

export default OrderForm
