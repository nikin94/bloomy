// The ONE place that fixes the on-screen order of the status block: the order
// status, the payment status, and the prepaid amount tied to it. Two screens
// render this block — the order form (selects grid) and the order detail page
// (inline rows) — and each hard-coded the sequence separately, which is exactly
// how they drifted twice (payment-first on one screen after the other had
// switched). Both now MAP over this array and look each key up in a local
// renderer record, so a reorder is a one-line change here and cannot desync.
//
// Scope note: this covers the block where the drift actually happened. If more
// shared-order blocks appear (e.g. the logistics rows), add a sibling constant
// here rather than growing a generic layout engine (YAGNI).
export const STATUS_BLOCK_FIELDS = ['status', 'paymentStatus', 'prepaid'] as const

export type StatusBlockField = (typeof STATUS_BLOCK_FIELDS)[number]
