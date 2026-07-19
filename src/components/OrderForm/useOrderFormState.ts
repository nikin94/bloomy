import { useReducer, useState } from 'react'
import { formatMinorToInput, parseRublesToMinor } from '@/utils/format'
import type {
  Currency,
  DeliveryMethod,
  Order,
  OrderSource,
  PaymentMethod,
  PaymentStatus,
  OrderStatus,
} from '@/types/order'
import type { Customer } from '@/types/customer'
import type { CustomerMode } from './CustomerPicker'
import type { OrderDraft } from './draft'
import { emptyItem, initialItems } from './items'
import type { ItemInput } from './items'

// The order form's FIELD state — every user-editable value, consolidated into
// one reducer instead of the wall of ~20 useState atoms OrderForm used to hold.
// A reducer (not react-hook-form) on purpose: the form's bespoke lifecycles —
// the localStorage draft, deferred photo upload, dangling-customer resolution —
// live OUTSIDE the field state and would fight a form library's own model,
// while the fields themselves are plain controlled values a reducer handles in
// ~100 lines with no dependency.
//
// Naming note: the workflow status is `status` here (matching OrderDraft and the
// stored order), where the old locals called it `orderStatus`.
export interface OrderFormFields {
  customerMode: CustomerMode
  selectedCustomerId: string
  newName: string
  newPhone: string
  address: string
  items: ItemInput[]
  // The order's gift name, or null when there is no gift row. '' means "row
  // added, name not typed yet" — see the schema note on `gifts`.
  giftName: string | null
  deliveryMethod: DeliveryMethod
  deliveryPrice: string
  paymentMethod: PaymentMethod
  currency: Currency
  paymentStatus: PaymentStatus
  // What the customer already paid, AS TYPED (a rubles string like the price
  // inputs — parsed to minor units in payload.ts). Edited only while the
  // payment status is 'prepaid' (the input hides otherwise), but the VALUE is
  // kept across a status switch so prepaid → paid preserves the history and an
  // accidental toggle away and back loses nothing.
  prepaidAmount: string
  status: OrderStatus
  // Marketplace the order came in from, or null for a direct order. The form
  // edits it as the "Заказ с Авито" checkbox; null (not undefined) so the value
  // serialises into the draft/snapshot JSON like every other field.
  source: OrderSource | null
  comment: string
  // Photos picked on the form, held LOCALLY (File objects) and uploaded only on
  // submit — abandoning the form leaves no orphaned blobs.
  pendingFiles: File[]
  // The edited order's saved photos still kept on it (all of them at first;
  // empty on create). Removing one in the picker only STAGES the removal here.
  keptPhotos: string[]
}

interface OrderFormState {
  fields: OrderFormFields
  // Monotonic id source for item rows, so React keys stay stable across
  // add/remove instead of being tied to array position.
  nextItemId: number
  // Id of the row whose name input should grab focus on mount — set when a row
  // is added so the user can type immediately; null after a prefill so no row
  // steals focus on load.
  focusItemId: number | null
  // Focus the gift name input only when the row was just added by the button —
  // not when it mounts prefilled from an edit/repeat seed.
  focusGift: boolean
  // The mode-slider pill only animates after the user interacts; the initial
  // fetch-driven switch to "existing" (applied via `set`, not `selectMode`)
  // must not slide.
  animateModeSlider: boolean
  // The delivery address the form held when the slider flipped to "new" (which
  // clears it for the fresh customer). Flipping BACK to "existing" restores
  // this — the selection is unchanged, so the address the user had (the edited
  // order's, or their own typing) must come back verbatim; re-prefilling from
  // the customer card would swap it for the customer's DEFAULT address (often
  // absent → the address silently vanished, the reported bug). null = nothing
  // stashed; cleared when consumed or when a different customer is picked
  // (then the pick's own prefill is the right value, not this stale stash).
  stashedAddress: string | null
}

type OrderFormAction =
  // Generic field patch — the plain setters (address, comment, selects, …) and
  // the post-resolve customer-mode/selection fixes all ride this.
  | { type: 'set'; patch: Partial<OrderFormFields> }
  | { type: 'updateItem'; index: number; patch: Partial<ItemInput> }
  | { type: 'addItem' }
  | { type: 'removeItem'; index: number }
  | { type: 'addGift' }
  | { type: 'removeGift' }
  // Picking a customer / toggling the mode slider also prefills the fields
  // derived from the customer (today: the address), so the action carries the
  // resolved customer — the reducer stays free of the options list.
  | { type: 'selectCustomer'; id: string; customer: Customer | undefined }
  | { type: 'selectMode'; mode: CustomerMode; customer: Customer | undefined }

// Single source of truth for prefilling order fields from an existing customer
// (undefined clears). Every customer-derived field must be set here and only
// here, so adding a new prefilled field stays a one-line change covered by all
// entry points: picking a customer, clearing the picker, toggling the slider.
const customerPrefill = (customer: Customer | undefined): Partial<OrderFormFields> => ({
  address: customer?.address ?? '',
})

const reducer = (state: OrderFormState, action: OrderFormAction): OrderFormState => {
  const { fields } = state
  switch (action.type) {
    case 'set':
      return { ...state, fields: { ...fields, ...action.patch } }
    case 'updateItem':
      return {
        ...state,
        fields: {
          ...fields,
          items: fields.items.map((item, i) =>
            i === action.index ? { ...item, ...action.patch } : item,
          ),
        },
      }
    case 'addItem': {
      // Only when the last row has a name — otherwise the user could pile up
      // empty rows (empty rows are also dropped on submit). Guarded here (not
      // just at the disabled button) so the invariant holds for any dispatcher.
      const last = fields.items[fields.items.length - 1]
      if (last === undefined || last.name.trim() === '') return state
      const id = state.nextItemId
      return {
        ...state,
        fields: { ...fields, items: [...fields.items, emptyItem(id)] },
        nextItemId: id + 1,
        focusItemId: id,
      }
    }
    case 'removeItem':
      // The form always keeps at least one row.
      if (fields.items.length <= 1) return state
      return {
        ...state,
        fields: { ...fields, items: fields.items.filter((_, i) => i !== action.index) },
      }
    case 'addGift':
      // At most ONE gift per order (the schema is an array for the future; the
      // form enforces today's limit).
      if (fields.giftName !== null) return state
      return { ...state, fields: { ...fields, giftName: '' }, focusGift: true }
    case 'removeGift':
      return { ...state, fields: { ...fields, giftName: null } }
    case 'selectCustomer':
      // Reset prefilled fields, then fill from the newly picked customer —
      // always resetting first means a previous customer's data can't linger
      // when the new pick (or the placeholder, id === '') lacks it. A real
      // pick also invalidates the mode-switch stash: the address kept for the
      // PREVIOUS selection must not overwrite this customer's prefill later.
      return {
        ...state,
        stashedAddress: null,
        fields: {
          ...fields,
          selectedCustomerId: action.id,
          ...customerPrefill(action.customer),
        },
      }
    case 'selectMode': {
      // "new" starts a fresh customer → clear prefilled fields, remembering
      // the address so a round-trip restores it; "existing" brings back the
      // stashed address when one exists (the selection didn't change — the
      // user just peeked at the other mode) and only falls back to the
      // customer-card prefill when there is nothing to restore (e.g. the form
      // STARTED in "new", so no stash was ever taken).
      const toNew = action.mode === 'new'
      return {
        ...state,
        animateModeSlider: true,
        stashedAddress: toNew ? fields.address : null,
        fields: {
          ...fields,
          customerMode: action.mode,
          ...(toNew
            ? customerPrefill(undefined)
            : state.stashedAddress !== null
              ? { address: state.stashedAddress }
              : customerPrefill(action.customer)),
        },
      }
    }
  }
}

// What seeds the initial field values, in priority order: a restored DRAFT wins
// over both defaults and the source order — it IS the user's own last state for
// this form (never set alongside `source` by the caller contract in OrderForm).
export interface OrderFormInit {
  draft: OrderDraft | null
  // The order whose CONTENTS prefill the form: the edited order or a repeat
  // seed. Only an EDIT (initialOrder) additionally carries the per-instance
  // state — statuses, comment, photos — so those read from it alone.
  source: Order | undefined
  initialOrder: Order | undefined
  defaults: {
    deliveryMethod: DeliveryMethod
    paymentMethod: PaymentMethod
    currency: Currency
  }
}

const createInitialState = ({ draft, source, initialOrder, defaults }: OrderFormInit): OrderFormState => {
  // A restored draft holds the rows as typed (strings, ids re-assigned by
  // index); a draft is only ever written with at least one named plant, but
  // stay defensive about an empty list so the form always has its blank row.
  const items =
    draft && draft.items.length > 0
      ? draft.items.map((item, id) => ({ id, ...item }))
      : initialItems(source)
  return {
    fields: {
      // New orders default to "new"; an edited/repeated order already has a
      // customer, so it starts in "existing" with that customer selected. (The
      // post-fetch flip to "existing" for returning users with an address book
      // is applied by OrderForm once the customer options resolve.)
      customerMode: draft?.customerMode ?? (source ? 'existing' : 'new'),
      selectedCustomerId: draft?.selectedCustomerId ?? source?.customerId ?? '',
      newName: draft?.newName ?? '',
      newPhone: draft?.newPhone ?? '',
      address: draft?.address ?? source?.address ?? '',
      items,
      giftName: draft ? draft.giftName : (source?.gifts?.[0]?.name ?? null),
      deliveryMethod: draft?.deliveryMethod ?? source?.deliveryMethod ?? defaults.deliveryMethod,
      deliveryPrice:
        draft?.deliveryPrice ?? (source ? formatMinorToInput(source.deliveryPriceMinor) : ''),
      paymentMethod: draft?.paymentMethod ?? source?.paymentMethod ?? defaults.paymentMethod,
      // Currency is fixed per order (no conversion): an edit/repeat keeps the
      // source currency, a new order starts in the user's default.
      currency: draft?.currency ?? source?.currency ?? defaults.currency,
      paymentStatus: draft?.paymentStatus ?? initialOrder?.paymentStatus ?? 'pending',
      // Prepaid amount is PER-INSTANCE state (like the statuses/comment): an
      // EDIT prefills it, a repeat does not — the repeated order starts with a
      // fresh, unpaid payment lifecycle. `?? ''` covers drafts saved before
      // this field existed (optional in the draft schema).
      prepaidAmount:
        draft?.prepaidAmount ??
        (initialOrder?.prepaidAmountMinor !== undefined
          ? formatMinorToInput(initialOrder.prepaidAmountMinor)
          : ''),
      status: draft?.status ?? initialOrder?.status ?? 'processing',
      comment: draft?.comment ?? initialOrder?.comment ?? '',
      // The marketplace source rides the CONTENTS (edit and repeat both prefill
      // it): repeating an Avito customer's order almost always means the same
      // channel again, and unchecking is one tap. `?? null` also covers a draft
      // saved before this field existed (its schema key is optional).
      source: draft ? (draft.source ?? null) : (source?.source ?? null),
      pendingFiles: [],
      keptPhotos: initialOrder?.photos ?? [],
    },
    // Rows are seeded with ids 0..n-1, so the counter continues from there.
    nextItemId: items.length,
    focusItemId: null,
    focusGift: false,
    animateModeSlider: false,
    stashedAddress: null,
  }
}

// The consolidated form state plus its derived values. `init` is read once (a
// useReducer initializer), matching the old contract: the caller must load the
// order/draft before mounting the form, not swap them in later.
export function useOrderFormState(init: OrderFormInit) {
  const [state, dispatch] = useReducer(reducer, init, createInitialState)
  const { fields } = state

  // Dirtiness: a per-render comparison of the user-editable fields against a
  // snapshot taken on the FIRST render (state still holds its initial values
  // then), so an edit/repeat prefill does NOT count as dirty — only the user's
  // own changes do. customerMode is deliberately excluded: the customer fetch
  // flips it to "existing" on its own (no user action) once the book resolves.
  // pendingFiles ride as a count — File objects don't stringify meaningfully.
  const fieldsSnapshot = JSON.stringify([
    fields.items,
    fields.giftName,
    fields.address,
    fields.newName,
    fields.newPhone,
    fields.selectedCustomerId,
    fields.deliveryMethod,
    fields.deliveryPrice,
    fields.paymentMethod,
    fields.currency,
    fields.paymentStatus,
    fields.prepaidAmount,
    fields.status,
    fields.source,
    fields.comment,
    fields.pendingFiles.length,
    fields.keptPhotos,
  ])
  // useState initializer (not a ref): the first-render snapshot is state read
  // during render, which is legal where reading a ref in render is not.
  const [initialFields] = useState(fieldsSnapshot)
  // A restored draft counts as dirty from the start: the snapshot already holds
  // the draft values, but they ARE unsaved user input — cancel must still ask.
  const isDirty = fieldsSnapshot !== initialFields || init.draft !== null

  // Owner-specified draft gate (also keys the restored-draft notice): a draft
  // exists only while the list holds at least one named plant.
  const hasNamedPlant = fields.items.some((item) => item.name.trim() !== '')
  const lastItem = fields.items[fields.items.length - 1]
  const canAddItem = lastItem !== undefined && lastItem.name.trim() !== ''

  // Live preview of the derived totals (same money model as the order itself):
  // the footer's headline is the PLANTS-ONLY subtotal, delivery shown beside it.
  const subtotalMinor = fields.items.reduce(
    // A blank/zero quantity counts as 1 here, matching what gets saved.
    (sum, item) => sum + parseRublesToMinor(item.price) * (Number(item.quantity) || 1),
    0,
  )
  const deliveryMinor = parseRublesToMinor(fields.deliveryPrice)
  // The typed prepaid amount as minor units, for the footer's live preview —
  // the same parse the payload applies, so what the footer shows IS what saves.
  const prepaidMinor = parseRublesToMinor(fields.prepaidAmount)

  return {
    fields,
    focusItemId: state.focusItemId,
    focusGift: state.focusGift,
    animateModeSlider: state.animateModeSlider,
    isDirty,
    hasNamedPlant,
    canAddItem,
    subtotalMinor,
    deliveryMinor,
    prepaidMinor,
    setFields: (patch: Partial<OrderFormFields>) => dispatch({ type: 'set', patch }),
    updateItem: (index: number, patch: Partial<ItemInput>) =>
      dispatch({ type: 'updateItem', index, patch }),
    addItem: () => dispatch({ type: 'addItem' }),
    removeItem: (index: number) => dispatch({ type: 'removeItem', index }),
    addGift: () => dispatch({ type: 'addGift' }),
    removeGift: () => dispatch({ type: 'removeGift' }),
    selectCustomer: (id: string, customer: Customer | undefined) =>
      dispatch({ type: 'selectCustomer', id, customer }),
    selectMode: (mode: CustomerMode, customer: Customer | undefined) =>
      dispatch({ type: 'selectMode', mode, customer }),
  }
}

export type OrderFormStateApi = ReturnType<typeof useOrderFormState>
