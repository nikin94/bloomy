import { z } from 'zod'
import {
  CURRENCY_SCHEMA,
  DELIVERY_METHOD_SCHEMA,
  ORDER_SOURCE_SCHEMA,
  ORDER_STATUS_SCHEMA,
  PAYMENT_METHOD_SCHEMA,
  PAYMENT_STATUS_SCHEMA,
} from '@/types/order'

// Local draft of the CREATE order form (see OrderForm). Written to localStorage —
// deliberately NOT Firestore: the draft is device-local scratch state, half-typed
// and unvalidated, so syncing it would push junk into the order collection and
// cost writes for text that may never be saved. localStorage survives navigation,
// refresh and full restarts, and reads synchronously on mount — so the restore
// works offline and never flashes an empty form first.
//
// Field values are stored exactly as typed (the form's string inputs, e.g. a
// price like "149,90"), not parsed into the Order model — restoring must put back
// what the user SAW. Photos are absent by design: pending photos are File objects
// (not serialisable to localStorage), so they are the one thing a restore drops.
// The schema mirrors the enums of the stored order, so a draft written before an
// enum was renamed simply fails validation and is discarded — a stale draft can
// never crash the form.
const DRAFT_ITEM_SCHEMA = z.object({
  name: z.string(),
  quantity: z.string(),
  price: z.string(),
})

export const ORDER_DRAFT_SCHEMA = z.object({
  customerMode: z.enum(['existing', 'new']),
  selectedCustomerId: z.string(),
  newName: z.string(),
  newPhone: z.string(),
  address: z.string(),
  items: z.array(DRAFT_ITEM_SCHEMA),
  giftName: z.string().nullable(),
  deliveryMethod: DELIVERY_METHOD_SCHEMA,
  deliveryPrice: z.string(),
  paymentMethod: PAYMENT_METHOD_SCHEMA,
  currency: CURRENCY_SCHEMA,
  paymentStatus: PAYMENT_STATUS_SCHEMA,
  // Strict three-state enum, like the stored order: a draft written back when
  // legacy status values/field names existed simply fails validation and is
  // discarded (the documented stale-draft contract) — never crashes the form.
  status: ORDER_STATUS_SCHEMA,
  // Marketplace source, null for a direct order. OPTIONAL (unlike the fields
  // above) so a draft saved before this field existed still restores instead of
  // being discarded — the reader treats a missing key as null.
  source: ORDER_SOURCE_SCHEMA.nullable().optional(),
  comment: z.string(),
})

export type OrderDraft = z.infer<typeof ORDER_DRAFT_SCHEMA>

// Per-owner key: two accounts on one browser must not see each other's draft.
// The `v1` slot lets a future shape change simply orphan old drafts (the schema
// check above already discards them) without colliding on the same key.
const draftKey = (ownerId: string) => `bloomy:order-draft:v1:${ownerId}`

// The stored draft, or null when there is none / it fails to parse / storage is
// unavailable (private mode). Never throws — a broken draft must not take the
// create form down with it.
export const loadOrderDraft = (ownerId: string): OrderDraft | null => {
  try {
    const raw = localStorage.getItem(draftKey(ownerId))
    if (raw === null) return null
    const parsed = ORDER_DRAFT_SCHEMA.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    // Corrupt JSON or storage access denied — treat as "no draft".
    return null
  }
}

// Best-effort write: quota exceeded / private mode just means no draft this
// session — the form itself must keep working.
export const saveOrderDraft = (ownerId: string, draft: OrderDraft): void => {
  try {
    localStorage.setItem(draftKey(ownerId), JSON.stringify(draft))
  } catch {
    // Draft persistence is a convenience, never worth surfacing an error for.
  }
}

export const clearOrderDraft = (ownerId: string): void => {
  try {
    localStorage.removeItem(draftKey(ownerId))
  } catch {
    // Same best-effort contract as saveOrderDraft.
  }
}
