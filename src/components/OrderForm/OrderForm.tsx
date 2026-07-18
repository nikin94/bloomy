import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createCustomer } from '@/firebase/customers'
import { useOwnerId } from '@/hooks/useOwnerId'
import { useSettings } from '@/context/settingsContext'
import { formatMoney } from '@/utils/format'
import {
  resolveCompletedAt,
  CURRENCIES,
  DELIVERY_METHOD_VALUES,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS_VALUES,
  ORDER_STATUS_VALUES,
} from '@/types/order'
import {
  currencyOptions,
  deliveryMethodOptions,
  paymentMethodOptions,
  paymentStatusOptions,
  orderStatusOptions,
} from '@/lib/orderLabels'
import { asEnum } from '@/utils/asEnum'
import Spinner from '@/components/Spinner/Spinner'
import Select from '@/components/Select/Select'
import Button from '@/components/Button/Button'
import CheckIcon from '@/components/icons/CheckIcon'
import CloseIcon from '@/components/icons/CloseIcon'
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal'
import Input from '@/components/Input/Input'
import Textarea from '@/components/Textarea/Textarea'
import PendingPhotos from '@/components/OrderPhotos/PendingPhotos'
import SelectOptions from '@/components/SelectOptions/SelectOptions'
import PlantItemRow from './PlantItemRow'
import GiftRow from './GiftRow'
import CustomerPicker from './CustomerPicker'
import { useOrderFormState } from './useOrderFormState'
import type { OrderFormFields } from './useOrderFormState'
import { useOrderDraft, useOrderDraftSync } from './useOrderDraft'
import { useCustomerOptions } from './useCustomerOptions'
import { usePlantHistory } from './usePlantHistory'
import { parsePlants, buildOrderPayload } from './payload'
import type { ItemInput } from './items'
import type { CustomerMode } from './CustomerPicker'
import { newOrderId } from '@/firebase/orders'
import { deleteOrderPhoto, uploadOrderPhoto } from '@/firebase/photos'
import { reportError } from '@/observability/reportError'
import type { NewOrder } from '@/firebase/orders'
import type { Order } from '@/types/order'
import type { NewCustomer } from '@/types/customer'

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

// The order form screen, shared by the create and edit pages. The caller
// supplies the heading and how a finished order is persisted (OrderFormProps);
// the form's own concerns are split across sibling modules, each independently
// unit-testable:
//   • useOrderFormState — every user-editable field, in one reducer, plus the
//     derived values (dirtiness, totals, add-row gates);
//   • useOrderDraft / useOrderDraftSync — the localStorage draft's load /
//     autosave / clear lifecycle and the restored-draft notice;
//   • useCustomerOptions — the customer picker's options via the shared
//     TanStack cache, incl. the soft-deleted seeded customer and dangling-FK
//     cleanup, gating the form's first paint;
//   • usePlantHistory — plant-name suggestions + the per-customer gift history
//     (non-critical, never gates the form);
//   • payload — the pure field→document assembly (parsePlants /
//     buildOrderPayload).
// What REMAINS here is the orchestration only: validation order, the submit
// flow (customer creation → deferred photo upload with rollback → onSubmit →
// staged-removal cleanup → draft clear) and the markup.
const OrderForm = ({ heading, initialOrder, seed, onSubmit, onCancel }: OrderFormProps) => {
  const { t } = useTranslation(['order', 'common'])
  // Order-bound t for the option helpers (typed TFunction<'order'>).
  const { t: tOrder } = useTranslation('order')
  // Owner of every record created here. Guaranteed non-null under ProtectedRoute.
  const ownerId = useOwnerId()
  // A new order's delivery/payment method starts from the user's saved defaults
  // (set in Settings); an edited order keeps its own stored values.
  const { defaultDeliveryMethod, defaultPaymentMethod, defaultCurrency } = useSettings()

  // The order whose CONTENTS prefill the form: the edited order, or a repeat
  // seed. Both fill customer/plants/address/methods/currency identically; only
  // an EDIT additionally carries the per-instance state (statuses, comment,
  // photos), so those read from `initialOrder` alone and stay pristine on a
  // repeat (see useOrderFormState's initializer).
  const source = initialOrder ?? seed

  // Whether this form CREATES an order (vs editing one in place). A repeat seed
  // does NOT carry the original's photos — they belong to that order — so the
  // pending-photo list starts empty either way.
  const isCreate = initialOrder === undefined

  // Local draft (owner request): a plain CREATE form keeps what was typed in
  // localStorage. Scoped to the create-without-seed case only: an EDIT's source
  // of truth is the order itself, and a REPEAT seed already prefills the form
  // (restoring a draft over it would silently swap the just-repeated order for
  // older scratch). Loaded once, before the reducer below seeds from it.
  const draftHandle = useOrderDraft(ownerId, isCreate && seed === undefined)
  const { draft } = draftHandle

  // The order's document id, pre-generated for a create so the photos uploaded
  // at submit land under orders/{ownerId}/{orderId}/ — the SAME id the doc is
  // created with (passed to createOrder), keeping the storage path in lockstep
  // with the cleanup function's `{orderId}` prefix. An edit already has its id.
  const [createId] = useState(newOrderId)
  const orderId = initialOrder?.id ?? createId

  // Every user-editable field, one reducer (see useOrderFormState).
  const form = useOrderFormState({
    draft,
    source,
    initialOrder,
    defaults: {
      deliveryMethod: defaultDeliveryMethod,
      paymentMethod: defaultPaymentMethod,
      currency: defaultCurrency,
    },
  })
  const { fields } = form

  const [saving, setSaving] = useState(false)
  // Becomes true on the first submit attempt; until then, incomplete-row hints
  // (e.g. a named plant without a price) stay hidden so the form doesn't nag
  // while the user is still filling it in.
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  // The picker's options via the shared query cache. `ready` gates the form's
  // first paint (the Spinner below): the initial customer mode depends on
  // whether the address book is empty, so painting earlier would show the
  // slider at "new" and snap it to "existing" once the data arrives. The
  // one-shot `onReady` applies the resolved landing in the same commit —
  // through `setFields` (not `selectMode`), so the flip never animates.
  const { customers, ready } = useCustomerOptions({
    ownerId,
    // The seeded selection that must resolve to an option or be cleared, never
    // silently saved: the edit/repeat source's customer, or a restored draft's.
    seededId: source?.customerId ?? (draft?.selectedCustomerId || undefined),
    // A restored draft carries the mode the user actually left the form in —
    // flipping to "existing" over it would hide a half-typed new-customer name.
    hasDraft: draft !== null,
    onReady: ({ clearDanglingSelection, mode }) => {
      const patch: Partial<OrderFormFields> = {}
      if (clearDanglingSelection) patch.selectedCustomerId = ''
      if (mode !== null) patch.customerMode = mode
      if (Object.keys(patch).length > 0) form.setFields(patch)
    },
  })

  // Plant-name suggestions + gift history from the owner's orders (shared cache;
  // non-critical, so it never gates the form). The edited order is excluded so
  // a form seeded with its own gift doesn't warn about itself.
  const { suggestions: plantNameSuggestions, sentGiftsByCustomer } = usePlantHistory(
    ownerId,
    initialOrder?.id,
  )

  // Draft autosave + the restored-draft notice (announced to screen readers
  // only after the form's first paint — hence `formReady`).
  const { showDraftNotice } = useOrderDraftSync(draftHandle, {
    fields,
    hasNamedPlant: form.hasNamedPlant,
    saving,
    formReady: ready,
  })

  // Cancel guard: once the user has started composing the order, "Отмена" asks
  // for confirmation instead of silently discarding the input (dirtiness lives
  // in useOrderFormState). A CONFIRMED cancel is the explicit "discard my
  // input" — drop the stored draft too, so the next create form starts blank.
  const handleCancel = () => (form.isDirty ? setConfirmingCancel(true) : onCancel())
  const handleConfirmedCancel = () => {
    draftHandle.clear()
    onCancel()
  }

  // Picking a real customer also clears the "select a customer" validation
  // error; the field prefill itself lives in the reducer (customerPrefill).
  const selectCustomer = (id: string) => {
    form.selectCustomer(id, customers.find((c) => c.id === id))
    if (id !== '') setError((prev) => (prev === t('form.errors.selectCustomer') ? null : prev))
  }
  const selectMode = (mode: CustomerMode) =>
    form.selectMode(mode, customers.find((c) => c.id === fields.selectedCustomerId))

  // Warn (never block) when the chosen existing customer already received the
  // same gift on an earlier order — matched case-insensitively. A new customer
  // has no history, so no warning in "new" mode.
  const giftAlreadySent =
    fields.giftName !== null &&
    fields.customerMode === 'existing' &&
    (sentGiftsByCustomer.get(fields.selectedCustomerId)?.has(fields.giftName.trim().toLowerCase()) ??
      false)

  // A row that has a name but no price is incomplete — flag its price input, but
  // only after a submit attempt so the field doesn't turn red while the user is
  // still typing. The trailing empty placeholder (no name yet) is never flagged.
  const isPriceMissing = (item: ItemInput) =>
    submitAttempted && item.name.trim() !== '' && item.price.trim() === ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSubmitAttempted(true)
    setError(null)

    if (!ownerId) {
      setError(t('form.errors.session'))
      return
    }

    const plants = parsePlants(fields.items)

    if (fields.customerMode === 'existing' && fields.selectedCustomerId === '') {
      setError(t('form.errors.selectCustomer'))
      return
    }
    if (fields.customerMode === 'new' && fields.newName.trim() === '') {
      setError(t('form.errors.customerName'))
      return
    }
    if (plants.length === 0) {
      setError(t('form.errors.noPlants'))
      return
    }
    // A named plant with no price is incomplete — block the save (the matching
    // price input is already flagged red via isPriceMissing).
    if (fields.items.some((item) => item.name.trim() !== '' && item.price.trim() === '')) {
      setError(t('form.errors.plantPrice'))
      return
    }

    setSaving(true)
    // Tracks photos that made it into Storage this attempt, so the catch below
    // can roll them back if the order write itself fails (all uploads succeeded
    // but onSubmit throws) — the doc never lands, so cloud-cleanup (#110) would
    // never fire for these, and abandoning the form would orphan them permanently.
    const uploadedPhotoPaths: string[] = []
    try {
      // Resolve the customer id: reuse the selected one, or create a new
      // customer first. The delivery address also seeds the new customer's
      // default address.
      let customerId = fields.selectedCustomerId
      if (fields.customerMode === 'new') {
        const newCustomer: NewCustomer = {
          ownerId,
          name: fields.newName.trim(),
          createdAt: Date.now(),
          ...(fields.newPhone.trim() !== '' ? { phone: fields.newPhone.trim() } : {}),
          ...(fields.address.trim() !== '' ? { address: fields.address.trim() } : {}),
        }
        customerId = await createCustomer(newCustomer)
        // The customer document now exists. If the save below fails and the user
        // retries, switch to the "existing" branch so we reuse this id instead
        // of creating a duplicate customer on every retry.
        form.setFields({ selectedCustomerId: customerId, customerMode: 'existing' })
      }

      // Completion stamp derived from the chosen status (e.g. creating or
      // editing an order straight into "delivered"); a re-save keeps the
      // original moment via the order's existing completedAt.
      const completedAt = resolveCompletedAt(fields.status, initialOrder?.completedAt, Date.now())

      // Deferred photo upload: now that we're committing to save the order, upload
      // the locally-picked files under orders/{ownerId}/{orderId}/ — on create the
      // same pre-generated id the doc is created with below, on edit the order's
      // own id. ALL-OR-NOTHING: if any upload fails, roll back the ones that DID
      // land (so nothing is orphaned), surface the error and keep the user on the
      // form to retry. Until this point nothing was uploaded, so a cancelled/
      // abandoned form costs zero Storage writes. Uploads need a connection
      // (Storage has no offline queue) — an offline save with new photos attached
      // fails here; a save with no new photos still works offline.
      let photoPaths: string[] = []
      if (fields.pendingFiles.length > 0) {
        const results = await Promise.allSettled(
          fields.pendingFiles.map((file) => uploadOrderPhoto(ownerId, orderId, file)),
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

      // Pure field→document assembly (see payload.ts). `dateCreated` is set by
      // the caller (Date.now() on create, the original on edit).
      const order = buildOrderPayload({
        fields,
        plants,
        ownerId,
        customerId,
        completedAt,
        uploadedPhotoPaths: photoPaths,
      })

      // The caller persists the order (create vs update) and navigates. The
      // pre-generated create id rides along so the doc lands on the same id the
      // photos were stored under (undefined/ignored on edit).
      await onSubmit(order, isCreate ? orderId : undefined)
      // The save landed — now actually delete the Storage files of the photos
      // removed in the picker (edit only; a create keeps nothing to remove).
      // Deleting only AFTER a successful save means a cancelled form or a failed
      // save never touches them; best-effort — a failure here only leaves an
      // orphan blob, not a UI error.
      const removedPhotos = (initialOrder?.photos ?? []).filter(
        (path) => !fields.keptPhotos.includes(path),
      )
      removedPhotos.forEach((path) =>
        deleteOrderPhoto(path).catch((e) => reportError(e, 'orderFormRemovePhoto')),
      )
      // The order is saved — the draft has served its purpose. Cleared only
      // AFTER onSubmit resolves, so a failed save (the catch below) keeps the
      // draft and the input survives even a page-leave after the failure.
      draftHandle.clear()
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

  // Wait for the customer options before painting the form, so the mode slider
  // starts in the correct position instead of snapping from "new" to "existing".
  if (!ready) return <Spinner />

  return (
    <>
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        {/* Scrollable body — the footer below stays pinned. */}
        {/* Half the horizontal padding on a phone (p-6 → px-3): the narrow
            screen needs the width for the inputs more than for gutters. */}
        <div className="flex-1 overflow-auto p-6 max-sm:px-3">
          {/* Full-width form (the sidebar freed the horizontal space); the
              method/status selects already lay out in 3-column grids that spread
              across it. */}
          <div className="flex w-full flex-col gap-5">
            <h1 className="m-0 text-[1.2222rem] font-semibold text-heading">{heading}</h1>

          {/* Restored-draft notice. Photos never make it into the draft (File
              objects don't serialize to localStorage), so a user who attached
              photos, left, and came back would otherwise save the restored form
              WITHOUT them and never know — the exact "заказ есть, фото нет"
              report. Say it up front so they re-attach before saving. The
              region mounts EMPTY (sr-only) and the text arrives via the reveal
              effect (useOrderDraftSync), so screen readers announce it; it
              empties again when the stored draft is deleted (the autosave). */}
          {draft !== null && (
            <p
              role="status"
              className={
                showDraftNotice
                  ? 'm-0 rounded-md border border-border bg-primary-bg px-3 py-2 text-sm text-text'
                  : 'sr-only m-0'
              }
            >
              {showDraftNotice && t('form.draftRestored')}
            </p>
          )}

          <CustomerPicker
            mode={fields.customerMode}
            customers={customers}
            selectedCustomerId={fields.selectedCustomerId}
            newName={fields.newName}
            newPhone={fields.newPhone}
            animate={form.animateModeSlider}
            t={t}
            onSelectMode={selectMode}
            onSelectCustomer={selectCustomer}
            onChangeNewName={(value) => form.setFields({ newName: value })}
            onChangeNewPhone={(value) => form.setFields({ newPhone: value })}
          />

          <Input
            className="w-full"
            label={t('form.deliveryAddress')}
            value={fields.address}
            onChange={(e) => form.setFields({ address: e.target.value })}
          />

          {/* The plant list is set off by a divider above and below instead of a
              text heading. The legend is kept sr-only so the group still has an
              accessible name. min-w-0 defeats the fieldset UA `min-inline-size:
              min-content`, which otherwise stops the element from shrinking to its
              flex parent and lets a tight row overflow to the right. */}
          <span aria-hidden="true" className="h-px w-full bg-border" />
          {/* Wider gap between item BLOCKS on a phone (gap-4) than between the
              two input lines inside one block (the row's own gap-2): the floating
              labels eat most of the space between inputs, so without the extra
              separation plant 1 / plant 2 / the gift read as one solid column.
              From `sm` up each item is a single line, so gap-2 suffices. */}
          <fieldset className="flex min-w-0 flex-col gap-4 border-0 p-0 sm:gap-2">
            <legend className="sr-only">{t('form.plants')}</legend>
            {fields.items.map((item, index) => (
              <PlantItemRow
                key={item.id}
                position={index + 1}
                item={item}
                priceMissing={isPriceMissing(item)}
                canRemove={fields.items.length > 1}
                autoFocus={item.id === form.focusItemId}
                suggestions={plantNameSuggestions}
                t={t}
                onChange={(patch) => form.updateItem(index, patch)}
                onRemove={() => form.removeItem(index)}
              />
            ))}
            {/* The gift line sits under the priced plant rows: a free plant
                (name only), at most one per order — see GiftRow / the schema. */}
            {fields.giftName !== null && (
              <GiftRow
                name={fields.giftName}
                alreadySent={giftAlreadySent}
                autoFocus={form.focusGift}
                suggestions={plantNameSuggestions}
                t={t}
                onChange={(value) => form.setFields({ giftName: value })}
                onRemove={form.removeGift}
              />
            )}
            {/* One row on every width. While a gift can still be added the pair
                splits a phone width 50/50 with the shortened labels ("+ Растение"
                / "+ Подарок", nowrap so the + never breaks onto its own line);
                once a gift row exists its button DISAPPEARS (one gift per order)
                and the plant button takes the whole row with its full label back.
                From `sm` up the buttons keep their natural width on the left.
                aria-label pins the accessible name to the FULL label on every
                width, so screen readers (and the tests) see one stable name. */}
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={form.addItem}
                disabled={!form.canAddItem}
                aria-label={t('form.addPlant')}
                className="whitespace-nowrap max-sm:flex-1"
              >
                {fields.giftName === null ? (
                  <>
                    <span className="sm:hidden">{t('form.addPlantShort')}</span>
                    <span className="max-sm:hidden">{t('form.addPlant')}</span>
                  </>
                ) : (
                  t('form.addPlant')
                )}
              </Button>
              {fields.giftName === null && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={form.addGift}
                  aria-label={t('form.addGift')}
                  className="whitespace-nowrap max-sm:flex-1"
                >
                  <span className="sm:hidden">{t('form.addGiftShort')}</span>
                  <span className="max-sm:hidden">{t('form.addGift')}</span>
                </Button>
              )}
            </div>
          </fieldset>
          <span aria-hidden="true" className="h-px w-full bg-border" />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Select
              label={t('form.deliveryMethod')}
              value={fields.deliveryMethod}
              onChange={(e) =>
                form.setFields({
                  deliveryMethod: asEnum(DELIVERY_METHOD_VALUES, e.target.value, fields.deliveryMethod),
                })
              }
            >
              <SelectOptions options={deliveryMethodOptions(tOrder)} />
            </Select>

            <Input
              className="w-full"
              numeric="decimal"
              label={t('form.deliveryPrice')}
              value={fields.deliveryPrice}
              onChange={(e) => form.setFields({ deliveryPrice: e.target.value })}
            />

            {/* Currency governs every amount in the order (plant prices, delivery,
                total). Each option shows the localized name plus its symbol. */}
            <Select
              label={t('form.currency')}
              value={fields.currency}
              onChange={(e) =>
                form.setFields({ currency: asEnum(CURRENCIES, e.target.value, fields.currency) })
              }
            >
              <SelectOptions options={currencyOptions(tOrder)} />
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Select
              label={t('form.paymentMethod')}
              value={fields.paymentMethod}
              onChange={(e) =>
                form.setFields({
                  paymentMethod: asEnum(PAYMENT_METHOD_VALUES, e.target.value, fields.paymentMethod),
                })
              }
            >
              <SelectOptions options={paymentMethodOptions(tOrder)} />
            </Select>

            <Select
              label={t('form.paymentStatus')}
              value={fields.paymentStatus}
              onChange={(e) =>
                form.setFields({
                  paymentStatus: asEnum(PAYMENT_STATUS_VALUES, e.target.value, fields.paymentStatus),
                })
              }
            >
              <SelectOptions options={paymentStatusOptions(tOrder)} />
            </Select>

            <Select
              label={t('form.status')}
              value={fields.status}
              onChange={(e) =>
                form.setFields({ status: asEnum(ORDER_STATUS_VALUES, e.target.value, fields.status) })
              }
            >
              <SelectOptions options={orderStatusOptions(tOrder)} />
            </Select>
          </div>

          <Textarea
            className="min-h-20 w-full"
            label={t('form.comment')}
            value={fields.comment}
            onChange={(e) => form.setFields({ comment: e.target.value })}
          />

          {/* Photo attachments, on create AND edit. Newly picked photos are held
              LOCALLY and uploaded on submit (see handleSubmit), so nothing hits
              Storage until the order is saved — no orphans if the form is
              abandoned. On an edit the strip ALSO shows the order's saved photos
              (the detail page is view-only): removing one is staged in
              `keptPhotos` and applied on save — the same commit point as every
              other change on the form. */}
          {ownerId && (
            <>
              <span aria-hidden="true" className="h-px w-full bg-border" />
              <PendingPhotos
                files={fields.pendingFiles}
                onChange={(files) => form.setFields({ pendingFiles: files })}
                existing={fields.keptPhotos}
                onRemoveExisting={(path) =>
                  form.setFields({ keptPhotos: fields.keptPhotos.filter((p) => p !== path) })
                }
              />
            </>
          )}

          </div>
        </div>

        {/* Pinned footer: the running total and actions stay visible while the
            plant list grows, so the user never has to scroll to see the total. */}
        <div className="border-t border-border bg-bg px-6 py-4 max-sm:px-3">
          <div className="flex w-full flex-col gap-3">
            {error && (
              <p role="alert" className="m-0 text-danger">
                {error}
              </p>
            )}
            {/* One compact row on every width: the total on the left, then the
                cancel and — in the right corner — the submit (cancel BEFORE
                submit, so the primary action sits at the edge). On a phone the
                "Итого" label sits in small type above the amount, the buttons
                collapse to icons (✕ cancel / ✓ save) and the SUBMIT stretches
                over all the remaining width; a small extra margin keeps the ✕
                clear of the amount. From `sm` up the buttons show their text
                labels at natural width, pushed right. Cancel confirms first when
                the form is dirty (see handleCancel). aria-label keeps the
                accessible name at the full text on every width. On a phone the
                row stretches its items, so both buttons grow to the height of
                the total block (label + amount + delivery note) and the trio
                reads as one even-height bar; the buttons' own content stays
                centred (Button is inline-flex items-center). */}
            <div className="flex items-center gap-3 max-sm:items-stretch">
              {/* min-w-0 on a phone (shrink-0 only from sm up): this block sits
                  in a row with the ✕/✓ buttons, so it MUST be able to shrink —
                  an unshrinkable block plus a nowrap note exceeds a narrow
                  viewport's width, and with no scroll container above the
                  footer that overflow escapes to the page and stretches the
                  whole screen sideways. */}
              <div className="flex items-baseline gap-2 max-sm:min-w-0 max-sm:flex-col max-sm:gap-0 sm:shrink-0">
                <span className="text-sm text-text max-sm:text-xs">{t('form.total')}</span>
                {/* Plants-only headline; the delivery cost in small type
                    (rendered only when a delivery price is entered) sits beside
                    it on desktop, but drops to its OWN line under the amount on
                    a phone — the stacked label column is narrow, so an inline
                    note would push the buttons instead of wrapping. nowrap only
                    from sm up: on a phone the note wraps between words when the
                    row is tight (the amount itself holds together via the NBSP
                    inside formatMoney) instead of forcing the row wider. */}
                <span className="flex items-baseline gap-1.5 max-sm:min-w-0 max-sm:flex-col max-sm:gap-0">
                  <span className="text-lg font-semibold text-heading">
                    {formatMoney(form.subtotalMinor, fields.currency)}
                  </span>
                  {form.deliveryMinor > 0 && (
                    <span className="text-xs text-text sm:whitespace-nowrap">
                      {t('form.totalDelivery', {
                        amount: formatMoney(form.deliveryMinor, fields.currency),
                      })}
                    </span>
                  )}
                </span>
              </div>
              <Button
                variant="secondary"
                onClick={handleCancel}
                aria-label={t('common:cancel')}
                className="max-sm:ml-2 max-sm:p-2.5 sm:ml-auto"
              >
                <CloseIcon className="size-5 sm:hidden" />
                <span className="max-sm:hidden">{t('common:cancel')}</span>
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={saving}
                aria-label={t('common:save')}
                className="max-sm:flex-1 max-sm:p-2.5"
              >
                <CheckIcon className="size-5 sm:hidden" />
                <span className="max-sm:hidden">{t('common:save')}</span>
              </Button>
            </div>
          </div>
        </div>
      </form>

    {/* Leave-without-saving confirmation — mounted only when a dirty form's
        cancel was pressed (see handleCancel). Confirming leaves via
        handleConfirmedCancel (which also discards the stored draft); dismissing
        any way (stay button, backdrop, Esc) keeps the user on the form with
        everything typed intact — and the draft untouched. */}
    {confirmingCancel && (
      <ConfirmModal
        title={t('form.cancelConfirmTitle')}
        body={t('form.cancelConfirmBody')}
        confirmLabel={t('form.cancelConfirmLeave')}
        cancelLabel={t('form.cancelConfirmStay')}
        onConfirm={handleConfirmedCancel}
        onCancel={() => setConfirmingCancel(false)}
      />
    )}
    </>
  )
}

export default OrderForm
