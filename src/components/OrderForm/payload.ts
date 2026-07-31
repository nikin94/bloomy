import { parseRublesToMinor } from '@/utils/format'
import type { OrderItem } from '@/types/order'
import type { NewOrder } from '@/firebase/orders'
import type { ItemInput } from './items'
import type { OrderFormFields } from './useOrderFormState'

// Pure assembly of the order payload from the form's field values — extracted
// from handleSubmit so the field→document mapping is unit-testable without
// mounting the form (see payload.test.ts). Everything effectful (customer
// resolution, photo upload, the onSubmit call) stays in OrderForm.

// The stored line items from the typed rows: unnamed rows are dropped (they are
// placeholders, not input), a blank/zero quantity counts as 1 — matching the
// live total the footer previews.
export const parsePlants = (items: ItemInput[]): OrderItem[] =>
  items
    .filter((item) => item.name.trim() !== '')
    .map((item) => ({
      name: item.name.trim(),
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      unitPriceMinor: parseRublesToMinor(item.price),
    }))

// The order document body handed to the caller's onSubmit. `dateCreated` is
// intentionally absent — the caller owns it (Date.now() on create, the original
// on edit). Optional fields are OMITTED (not written empty) when blank: for a
// create nothing is stored, and updateOrder turns the absence into deleteField
// for its clearable set — so clearing a comment / removing the last photo on an
// edit really clears the stored field.
export function buildOrderPayload({
  fields,
  plants,
  ownerId,
  customerId,
  completedAt,
}: {
  fields: OrderFormFields
  // Already parsed (and validated non-empty) by the submit path.
  plants: OrderItem[]
  ownerId: string
  // Resolved by the submit path: the selected customer, or the one it just
  // created in "new" mode.
  customerId: string
  // Derived from the chosen status via resolveCompletedAt; undefined for a
  // non-terminal status (the field is then omitted → cleared on edit).
  completedAt: number | undefined
}): Omit<NewOrder, 'dateCreated'> {
  const giftName = fields.giftName?.trim() ?? ''
  const comment = fields.comment.trim()
  return {
    ownerId,
    customerId,
    address: fields.address.trim(),
    plants,
    paymentMethod: fields.paymentMethod,
    deliveryMethod: fields.deliveryMethod,
    deliveryPriceMinor: parseRublesToMinor(fields.deliveryPrice),
    currency: fields.currency,
    paymentStatus: fields.paymentStatus,
    status: fields.status,
    // Marketplace source: stored only when set — a direct order stores nothing
    // (see ORDER_SOURCE_SCHEMA), and on an edit the omission becomes deleteField
    // via CLEARABLE_ORDER_FIELDS, so unchecking really clears the stored field.
    ...(fields.source !== null ? { source: fields.source } : {}),
    // Prepaid amount: stored whenever a positive amount is typed, INDEPENDENT
    // of the current payment status — moving prepaid → paid keeps the history
    // of how the money arrived (owner decision). A blank/zero input stores
    // nothing; on an edit the omission becomes deleteField via
    // CLEARABLE_ORDER_FIELDS, so clearing the input really clears the field.
    ...(parseRublesToMinor(fields.prepaidAmount) > 0
      ? { prepaidAmountMinor: parseRublesToMinor(fields.prepaidAmount) }
      : {}),
    // The gift, when one was added and named. A blank gift row is dropped
    // silently, like empty plant rows. Free by definition: price 0, quantity 1,
    // so it never moves the totals (they read `plants` only).
    ...(giftName !== '' ? { gifts: [{ name: giftName, quantity: 1, unitPriceMinor: 0 }] } : {}),
    ...(comment !== '' ? { comment } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
  }
}
