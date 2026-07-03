import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createCustomer, fetchCustomer, fetchCustomers } from '@/firebase/customers'
import { useAuth } from '@/context/authContext'
import { useSettings } from '@/context/settingsContext'
import { formatMinorToInput, formatMoney, parseRublesToMinor } from '@/utils/format'
import {
  currencyOptions,
  deliveryMethodOptions,
  paymentMethodOptions,
  paymentStatusOptions,
  shipmentStatusOptions,
  resolveCompletedAt,
  collectPlantNames,
} from '@/types/order'
import Spinner from '@/components/Spinner/Spinner'
import Select from '@/components/Select/Select'
import Button from '@/components/Button/Button'
import Input from '@/components/Input/Input'
import Textarea from '@/components/Textarea/Textarea'
import PendingPhotos from '@/components/OrderPhotos/PendingPhotos'
import PlantItemRow from './PlantItemRow'
import CustomerPicker from './CustomerPicker'
import { emptyItem, initialItems } from './items'
import type { ItemInput } from './items'
import type { CustomerMode } from './CustomerPicker'
import { fetchOrders, newOrderId } from '@/firebase/orders'
import { deleteOrderPhoto, uploadOrderPhoto } from '@/firebase/photos'
import { reportError } from '@/observability/reportError'
import type { NewOrder } from '@/firebase/orders'
import type {
  Currency,
  DeliveryMethod,
  Order,
  OrderItem,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
} from '@/types/order'
import type { Customer, NewCustomer } from '@/types/customer'

interface OrderFormProps {
  // Screen heading, e.g. "New order" / "Edit order".
  heading: string
  // When editing, the existing order to prefill every field from. Omitted when
  // creating (the form starts blank). Read once on mount — the caller must load
  // the order before rendering the form, not swap this prop in later.
  initialOrder?: Order
  // Repeat-order ("Repeat") seed: an existing order whose CONTENTS prefill a
  // fresh create form (customer, plants, address, methods, currency). Unlike
  // `initialOrder` it does NOT carry over the per-instance state — statuses,
  // comment, number and dates start pristine — so the result is a brand-new
  // order, just pre-populated. Ignored when `initialOrder` is set (edit wins).
  seed?: Order
  // Persist the assembled order, then navigate. The form owns customer
  // resolution (creating a new customer when needed) and builds the order
  // payload, but NOT `dateCreated`: the caller owns it so create can stamp
  // `Date.now()` while edit preserves the original. The caller decides how the
  // order is stored (createOrder vs updateOrder) and where to go next. Throwing
  // surfaces the message as a form error and keeps the user on the page — a
  // newly created customer is already switched to the "existing" branch so a
  // retry reuses it instead of duplicating.
  //
  // `orderId` is the create form's pre-generated document id (undefined on edit):
  // photos were uploaded under it, so the caller must create the order with THIS
  // id (createOrder's `id`) to keep the photo storage path in lockstep.
  onSubmit: (order: Omit<NewOrder, 'dateCreated'>, orderId?: string) => Promise<void>
  // Leave the form without saving (the caller decides where to).
  onCancel: () => void
}

// The order form screen, shared by the create and edit pages. Owns all form
// state and validation; the caller supplies the heading and how a finished order
// is persisted (see OrderFormProps).
const OrderForm = ({ heading, initialOrder, seed, onSubmit, onCancel }: OrderFormProps) => {
  const { t } = useTranslation(['order', 'common'])
  // Order-bound t for the option helpers (typed TFunction<'order'>).
  const { t: tOrder } = useTranslation('order')
  // Owner of every record created here. Guaranteed non-null under ProtectedRoute.
  const { user } = useAuth()
  const ownerId = user?.uid
  // A new order's delivery/payment method starts from the user's saved defaults
  // (set in Settings); an edited order keeps its own stored values.
  const { defaultDeliveryMethod, defaultPaymentMethod, defaultCurrency } = useSettings()

  // The order whose CONTENTS prefill the form: the edited order, or a repeat
  // seed. Both fill customer/plants/address/methods/currency identically; only
  // an EDIT additionally carries the per-instance state (statuses, comment),
  // so those read from `initialOrder` alone and stay pristine on a repeat.
  const source = initialOrder ?? seed

  // Photo attachments are offered on CREATE only (an existing order edits its
  // photos on the detail page). A repeat seed does NOT carry the original's
  // photos — they belong to that order — so the list starts empty.
  const isCreate = initialOrder === undefined
  // The order's document id, pre-generated for a create so the photos uploaded at
  // submit land under orders/{ownerId}/{orderId}/ — the SAME id the doc is created
  // with (passed to createOrder), keeping the storage path in lockstep with the
  // cleanup function's `{orderId}` prefix. An edit already has its id. `useState`
  // initializer so it's stable across renders.
  const [createId] = useState(newOrderId)
  const orderId = initialOrder?.id ?? createId
  // Photos picked on a CREATE form are held LOCALLY (File objects) and only uploaded
  // on submit — see handleSubmit. Nothing touches Storage until the order is being
  // created, so abandoning the form leaves no orphaned blobs.
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  // Customer selection. New orders default to "new"; an edited order already has
  // a customer, so it starts in "existing" mode with that customer selected.
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerMode, setCustomerMode] = useState<CustomerMode>(source ? 'existing' : 'new')
  // Gate the form on the customer fetch: the initial mode depends on whether the
  // address book is empty, so rendering the form before it resolves would paint
  // the slider at "new" and snap it to "existing" once the data arrives. Showing
  // the spinner until then means the form first paints with the mode correct.
  const [customersLoading, setCustomersLoading] = useState(true)
  // The slider pill only animates after the user interacts. The initial
  // fetch-driven switch to "existing" (for returning users) must not slide.
  const [animateModeSlider, setAnimateModeSlider] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState(source?.customerId ?? '')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const [address, setAddress] = useState(source?.address ?? '')
  // Monotonic id source for item rows, so React keys stay stable across
  // add/remove instead of being tied to array position. Rows are seeded with ids
  // 0..n-1 (see initialItems), so the ref continues from there for rows added later.
  const itemIdRef = useRef(source ? source.plants.length - 1 : 0)
  const nextItemId = () => (itemIdRef.current += 1)
  const [items, setItems] = useState<ItemInput[]>(() => initialItems(source))
  // Id of the row whose name input should grab focus on mount — set when a row
  // is added so the user can type immediately. Null at first render (and after
  // a prefill) so no row steals focus on load.
  const [focusItemId, setFocusItemId] = useState<number | null>(null)
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(
    source?.deliveryMethod ?? defaultDeliveryMethod,
  )
  const [deliveryPrice, setDeliveryPrice] = useState(
    source ? formatMinorToInput(source.deliveryPriceMinor) : '',
  )
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    source?.paymentMethod ?? defaultPaymentMethod,
  )
  // A new order starts in the user's default currency; an edited order (or a
  // repeat) keeps the source currency — it is fixed per order, no conversion.
  const [currency, setCurrency] = useState<Currency>(source?.currency ?? defaultCurrency)
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

  // Plant-name autocomplete: distinct names from the owner's existing orders,
  // offered as suggestions on each row's name input (see Autocomplete).
  const [plantNameSuggestions, setPlantNameSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (!ownerId) return
    let active = true
    fetchCustomers(ownerId)
      .then(async (data) => {
        if (!active) return
        // When editing (or repeating) an order whose customer was soft-deleted,
        // that customer is absent from the active list — so the picker would drop
        // the current selection. Fetch it directly and keep it in the options
        // (labelled "(deleted)") so the order stays linked to it unless changed.
        const seededId = source?.customerId
        let list = data
        if (seededId && !data.some((c) => c.id === seededId)) {
          // Treat a throw (transient network / rules change) the same as an
          // unresolved customer: the whole point of this branch is dropping a
          // dangling FK, so a swallowed error must not leave the stale id in
          // place — otherwise the outer .catch would let it save anyway.
          let seededCustomer: Customer | null
          try {
            seededCustomer = await fetchCustomer(seededId)
          } catch {
            seededCustomer = null
          }
          if (!active) return
          if (seededCustomer) {
            list = [...data, seededCustomer]
          } else {
            // The seeded customer is truly gone (hard-deleted, e.g. via the admin
            // reset). fetchCustomer returns SOFT-deleted ones, so a null here
            // means no such document at all. Drop the dangling selection: the
            // submit guard only rejects an EMPTY id, so a stale id would sail
            // through and save the order against a non-existent customer FK
            // (rendering "—" everywhere). Clearing it forces the user to re-pick,
            // or to enter a new customer when the address book is now empty.
            setSelectedCustomerId('')
            if (data.length === 0) setCustomerMode('new')
          }
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
  }, [ownerId, source])

  // Load the autocomplete suggestions independently of the customer fetch: they
  // are non-critical, so a failure (or slow load) must never block or gate the
  // form — it just falls back to a plain name input. Active orders only
  // (fetchOrders drops deleted), i.e. the current assortment.
  useEffect(() => {
    if (!ownerId) return
    let active = true
    fetchOrders(ownerId)
      .then((orders) => {
        if (active) setPlantNameSuggestions(collectPlantNames(orders))
      })
      .catch(() => {
        // No suggestions on failure — the field still works as a plain input.
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
    // pick (or the "— select a customer —" placeholder, id === '') lacks it.
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
    // Tracks photos that made it into Storage this attempt, so the catch below can
    // roll them back if the order write itself fails (all uploads succeeded but
    // onSubmit throws) — the doc never lands, so cloud-cleanup (#110) would never
    // fire for these, and abandoning the form now would orphan them permanently.
    const uploadedPhotoPaths: string[] = []
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

      // Deferred photo upload (create only): now that we're committing to create the
      // order, upload the locally-picked files under orders/{ownerId}/{orderId}/ —
      // the same id the doc is created with below. ALL-OR-NOTHING: if any upload
      // fails, roll back the ones that DID land (so nothing is orphaned), surface the
      // error and keep the user on the form to retry. Until this point nothing was
      // uploaded, so a cancelled/abandoned form costs zero Storage writes. Uploads
      // need a connection (Storage has no offline queue) — an offline save with
      // photos attached fails here; a save with no photos still works offline.
      let photoPaths: string[] = []
      if (isCreate && pendingFiles.length > 0) {
        const results = await Promise.allSettled(
          pendingFiles.map((file) => uploadOrderPhoto(ownerId, orderId, file)),
        )
        if (results.some((r) => r.status === 'rejected')) {
          results.forEach((r) => {
            if (r.status === 'rejected') reportError(r.reason, 'orderFormPhotoUpload')
            // Best-effort rollback of any that DID upload, so a partial failure
            // still leaves no orphan behind an order that won't be created.
            else deleteOrderPhoto(r.value).catch((err) => reportError(err, 'orderFormPhotoRollback'))
          })
          setError(t('photos.uploadError'))
          setSaving(false)
          return
        }
        photoPaths = results.map((r) => (r as PromiseFulfilledResult<string>).value)
        uploadedPhotoPaths.push(...photoPaths)
      }

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
        // Deferred-upload photos (create only): the paths just returned from the
        // submit-time upload above, included only when there are any.
        ...(photoPaths.length > 0 ? { photos: photoPaths } : {}),
      }

      // The caller persists the order (create vs update) and navigates. The
      // pre-generated create id rides along so the doc lands on the same id the
      // photos were stored under (undefined/ignored on edit).
      await onSubmit(order, isCreate ? orderId : undefined)
    } catch (err: unknown) {
      // Roll back any photos already in Storage — the order doc will never exist
      // to trigger cloud-cleanup, so abandoning the form now would orphan them.
      // Best-effort: a failed rollback is logged, symmetric to the partial-upload path.
      uploadedPhotoPaths.forEach((path) =>
        deleteOrderPhoto(path).catch((e) => reportError(e, 'orderFormSubmitPhotoRollback')),
      )
      setError(err instanceof Error ? err.message : t('form.errors.saveFailed'))
      setSaving(false)
    }
  }

  // Cancel just leaves the form — nothing to clean up. Locally-picked photos were
  // never uploaded (deferred to submit), so abandoning them costs nothing.

  // Wait for the customer fetch before painting the form, so the slider starts
  // in the correct position instead of snapping from "new" to "existing".
  if (customersLoading) return <Spinner />

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        {/* Scrollable body — the footer below stays pinned. */}
        <div className="flex-1 overflow-auto p-6">
          {/* Full-width form (the sidebar freed the horizontal space); the
              method/status selects already lay out in 3-column grids that spread
              across it. */}
          <div className="flex w-full flex-col gap-5">
            <h1 className="m-0 text-[1.2222rem] font-semibold text-heading">{heading}</h1>

          <CustomerPicker
            mode={customerMode}
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            newName={newName}
            newPhone={newPhone}
            animate={animateModeSlider}
            t={t}
            onSelectMode={selectMode}
            onSelectCustomer={selectCustomer}
            onChangeNewName={setNewName}
            onChangeNewPhone={setNewPhone}
          />

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
                suggestions={plantNameSuggestions}
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

          {/* Photo attachments — create only (an edit manages photos on the order
              detail page). Picked photos are held LOCALLY and uploaded on submit
              (see handleSubmit), so nothing hits Storage until the order is created —
              no orphans if the form is abandoned. */}
          {isCreate && ownerId && (
            <>
              <span aria-hidden="true" className="h-px w-full bg-border" />
              <PendingPhotos files={pendingFiles} onChange={setPendingFiles} />
            </>
          )}

          </div>
        </div>

        {/* Pinned footer: the running total and actions stay visible while the
            plant list grows, so the user never has to scroll to see the total. */}
        <div className="border-t border-border bg-bg px-6 py-4">
          <div className="flex w-full flex-col gap-3">
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
  )
}

export default OrderForm
