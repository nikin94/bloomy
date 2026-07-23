import { useEffect, useState } from 'react'
import { loadOrderDraft, saveOrderDraft, clearOrderDraft } from './draft'
import type { OrderDraft } from './draft'
import type { OrderFormFields } from './useOrderFormState'

// The order form's localStorage draft, in two hooks because the lifecycle has
// two phases that straddle the form state itself:
//   1. useOrderDraft — LOAD, before the field state exists (the reducer's
//      initial values seed from the restored draft), plus the clear() used by
//      submit/cancel.
//   2. useOrderDraftSync — AUTOSAVE + the restored-notice reveal, after the
//      field state exists (both read the live fields).
// OrderForm calls them around useOrderFormState in exactly that order.

export interface OrderDraftHandle {
  // The restored draft, or null (none stored / disabled / failed to parse).
  draft: OrderDraft | null
  // Whether draft persistence is on for this mount (create-without-seed only).
  enabled: boolean
  // The owner the draft belongs to, CAPTURED once on mount — never the live
  // ownerId: if the auth user somehow changed while the form is open, a live
  // read would save user A's typed content under user B's key. The flip side —
  // mounting before auth resolves permanently disables the draft for this
  // mount — is fine: under ProtectedRoute the user is always resolved first.
  ownerId: string | undefined
  // Drop the stored draft (submit success / confirmed cancel). No-op when
  // the draft is disabled for this mount.
  clear: () => void
}

export function useOrderDraft(liveOwnerId: string | undefined, enabled: boolean): OrderDraftHandle {
  const [ownerId] = useState(liveOwnerId)
  // Loaded once, synchronously, before the form's state initializers seed from
  // it. Drafts are single-tab by design: two tabs on the create form are
  // last-write-wins on the same key, matching the app's single-operator usage.
  const [draft] = useState<OrderDraft | null>(() =>
    enabled && ownerId ? loadOrderDraft(ownerId) : null,
  )
  return {
    draft,
    enabled,
    ownerId,
    clear: () => {
      if (enabled && ownerId) clearOrderDraft(ownerId)
    },
  }
}

// Keep the stored draft in sync with the live fields, and reveal the
// restored-draft notice once the form has painted. Returns whether the notice
// should show. `saving` pauses the autosave (see the effect); `formReady` is
// the form's paint gate (the customer options resolving) — the notice reveal
// must come only after that first paint.
export function useOrderDraftSync(
  handle: OrderDraftHandle,
  {
    fields,
    hasNamedPlant,
    saving,
    formReady,
  }: { fields: OrderFormFields; hasNamedPlant: boolean; saving: boolean; formReady: boolean },
): { showDraftNotice: boolean } {
  const { draft, enabled, ownerId } = handle

  // Restored-draft notice, part 1 of 2: starts hidden and is flipped on a beat
  // AFTER the form paints (see the timeout effect below) — inserting the text
  // into an already-mounted `role="status"` region is what makes screen readers
  // actually announce it; content present at first paint is skipped.
  const [noticeRevealed, setNoticeRevealed] = useState(false)

  // Once the plant list empties, the RESTORED draft is gone for good (the
  // autosave below deletes it) — so the reveal is retired permanently, not just
  // hidden: typing a new plant name after that starts a FRESH autosaved draft,
  // and "восстановлен черновик" would describe the wrong one. Adjust-state-
  // during-render (guarded, runs once); safe because the reveal effect is keyed
  // on [formReady, draft] — both stable after mount — so nothing re-arms it.
  if (noticeRevealed && !hasNamedPlant) setNoticeRevealed(false)

  // Serialised in render (same technique as the dirtiness snapshot) so the
  // autosave effect re-runs only when the draft CONTENTS change, not on every
  // render. Row ids are stripped — they are React keys, re-assigned on restore.
  const draftJson = JSON.stringify({
    customerMode: fields.customerMode,
    selectedCustomerId: fields.selectedCustomerId,
    newName: fields.newName,
    newPhone: fields.newPhone,
    address: fields.address,
    items: fields.items.map(({ name, quantity, price }) => ({ name, quantity, price })),
    giftName: fields.giftName,
    deliveryMethod: fields.deliveryMethod,
    deliveryPrice: fields.deliveryPrice,
    paymentMethod: fields.paymentMethod,
    currency: fields.currency,
    paymentStatus: fields.paymentStatus,
    prepaidAmount: fields.prepaidAmount,
    status: fields.status,
    source: fields.source,
    comment: fields.comment,
  } satisfies OrderDraft)

  useEffect(() => {
    // Paused while a submit is in flight (`saving`): the new-customer path
    // flips customerMode/selectedCustomerId mid-submit, and this effect would
    // re-save the draft AFTER the success path just cleared it. A FAILED submit
    // resets `saving`, which re-runs this effect and re-saves — exactly right,
    // the input must survive a leave after a failure.
    if (!enabled || !ownerId || saving) return
    // Below the named-plant bar the stored draft is removed (deleting the last
    // plant name deletes the draft), so stray address/comment typing never
    // resurrects on the next visit.
    if (hasNamedPlant) {
      saveOrderDraft(ownerId, JSON.parse(draftJson) as OrderDraft)
    } else {
      clearOrderDraft(ownerId)
    }
  }, [draftJson, hasNamedPlant, enabled, ownerId, saving])

  // Reveal the notice only after the form has painted: the `role="status"`
  // region mounts empty and the text is inserted on a later, post-paint commit —
  // a CHANGE inside a live region, which screen readers announce; text already
  // present at first paint would be skipped silently. The zero timeout (not a
  // sync setState in the effect) is what pushes the flip past the paint.
  useEffect(() => {
    if (!formReady || draft === null) return
    const id = window.setTimeout(() => setNoticeRevealed(true), 0)
    return () => window.clearTimeout(id)
  }, [formReady, draft])

  // Part 2 of the notice: it shows exactly while a stored draft exists (the
  // named-plant gate mirrors the autosave above), so it can never describe a
  // draft that has already been deleted.
  return { showDraftNotice: noticeRevealed && hasNamedPlant }
}
