import { z } from 'zod'

// Status/method unions are defined as Zod enums so the runtime validator (used
// when reading Firestore documents) and the TypeScript types share a single
// source of truth. We still avoid `enum` — tsconfig enables erasableSyntaxOnly,
// which forbids it; the inferred string-literal unions are erasable.
// 'prepaid' was ADDED after orders already existed — a safe enum widening (every
// stored value stays valid, no migration), same as the 'avito' source. The value
// order here IS the dropdown order (PAYMENT_STATUS_VALUES = .options), so
// prepaid sits between pending and paid, matching the payment lifecycle. NOTE:
// the revenue selectors count ONLY 'paid' — a prepayment is not the full
// realized amount, so a prepaid order joins the revenue once it's marked paid.
export const PAYMENT_STATUS_SCHEMA = z.enum(['pending', 'prepaid', 'paid', 'refunded'])
export type PaymentStatus = z.infer<typeof PAYMENT_STATUS_SCHEMA>

// The order's workflow status ("статус заказа"). Reduced to exactly three
// states by owner decision: an order is being worked on, done, or cancelled.
// Named ORDER_STATUS (not just STATUS) because PaymentStatus lives right beside
// it. HISTORY: documents once carried retired values ('new'/'packing'/'shipped')
// under a retired field name (`shipmentStatus`); a lazy per-owner migration
// rewrote every stored document to this exact shape, after which the tolerant
// read schema, the field lift and the migration itself were removed — the
// stored data now matches this enum verbatim.
export const ORDER_STATUS_SCHEMA = z.enum(['processing', 'delivered', 'cancelled'])
export type OrderStatus = z.infer<typeof ORDER_STATUS_SCHEMA>

export const PAYMENT_METHOD_SCHEMA = z.enum(['cash', 'card', 'bank'])
export type PaymentMethod = z.infer<typeof PAYMENT_METHOD_SCHEMA>

// How the order is delivered. Keys are latin (stable storage values); the
// localized labels live in the `order` i18n ns and the display order is built in
// deliveryMethodOptions (alphabetical by label, with the "other" catch-all pinned last).
export const DELIVERY_METHOD_SCHEMA = z.enum(['bus', 'post', 'pickup', 'cdek', 'taxi', 'other'])
export type DeliveryMethod = z.infer<typeof DELIVERY_METHOD_SCHEMA>

// Currency an order is priced in. Per-order and FIXED: an order always shows in
// the currency it was created with — there is NO conversion, the number is the
// exact amount the operator entered (relabelling 1500₽ as $1500 would lie about
// the value). The settings default seeds a NEW order; an existing order keeps
// its own. All three are 2-decimal, so the integer minor-unit model (amount/100)
// holds; a 0/3-decimal currency (JPY/KWD) would need a per-currency divisor —
// none are offered. The code IS the value, so it doubles as the option label.
export const CURRENCY_SCHEMA = z.enum(['RUB', 'USD', 'EUR'])
export type Currency = z.infer<typeof CURRENCY_SCHEMA>
export const CURRENCIES = CURRENCY_SCHEMA.options

// Where the order came in from. A single-value enum ON PURPOSE (not a boolean
// `fromAvito`): marketplaces multiply — a second source is one more value here
// with zero migration, where a boolean would dead-end into either flag
// proliferation or a stored-data rewrite. The ABSENCE of the field is the
// "direct order" default, so every pre-existing document stays valid without a
// migration (widening is safe; narrowing is not) and the common case stores
// nothing. Latin value doubles as the i18n label key (`source.avito`), matching
// the status/method convention.
export const ORDER_SOURCE_SCHEMA = z.enum(['avito'])
export type OrderSource = z.infer<typeof ORDER_SOURCE_SCHEMA>

// A single line item in an order — a plant/flower.
// Starts as plain text (the plant name); saved together with quantity and a
// unit price. Amounts are integers in minor units (kopecks) to avoid float
// rounding errors; the unit price is a snapshot taken at order time.
export const ORDER_ITEM_SCHEMA = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
})
export type OrderItem = z.infer<typeof ORDER_ITEM_SCHEMA>

// The stored order document — every field Firestore holds for an order. The
// document id is the technical key (used in URLs/links) and is added on top as
// `Order`, not stored in the body, so it lives outside this schema.
//
// Money model: items are the source of truth. Subtotal and total are NOT
// stored — they are derived from the items (see getSubtotalMinor/getTotalMinor).
// Only delivery is an independent input and is stored. This keeps the order a
// live "notebook": editing items recomputes the totals, no stale snapshot.
export const STORED_ORDER_SCHEMA = z.object({
  // Per-owner sequential number. NULLABLE because an order can be created while
  // OFFLINE, where the numbering transaction (which needs the server) can't run:
  // such an order is written with `number: null` and gets its real number later,
  // by reconcileOrderNumbers, once the client is back online. A synced order
  // always has a positive int; `null` means "created offline, not yet numbered".
  number: z.number().int().positive().nullable(),
  dateCreated: z.number(), // timestamp (ms)
  ownerId: z.string().min(1), // app user UID that owns this order (multi-tenancy)
  customerId: z.string().min(1), // link to Customer — the live source of the customer name
  address: z.string(), // delivery address (may differ from the customer default)
  plants: z.array(ORDER_ITEM_SCHEMA).min(1), // at least one plant, enforced by the form
  paymentMethod: PAYMENT_METHOD_SCHEMA,
  // Added after orders already existed; default keeps pre-existing documents
  // (which have no deliveryMethod) valid. New orders always set it from the form.
  deliveryMethod: DELIVERY_METHOD_SCHEMA.default('post'),
  deliveryPriceMinor: z.number().int().nonnegative(), // minor units (kopecks)
  // Currency the order is priced in. Widened from a RUB-only literal to the
  // supported set; existing documents (all 'RUB') stay valid, so this is a safe
  // widening with no migration. New orders write the chosen currency.
  currency: CURRENCY_SCHEMA,
  // Gift plants included with the order for free. Same item shape as `plants`
  // (a gift IS a plant), but a SEPARATE array so the money selectors — which
  // read only `plants` — never count a gift into the subtotal/total/revenue.
  // Stored as an array to leave room for several gifts per order later; TODAY
  // the form allows at most one (quantity 1, unitPriceMinor 0). A non-empty
  // array is the "order includes a gift" signal — no separate boolean flag that
  // could drift out of sync. Optional so every pre-existing document stays
  // valid without a migration (widening is safe; narrowing is not).
  gifts: z.array(ORDER_ITEM_SCHEMA).optional(),
  paymentStatus: PAYMENT_STATUS_SCHEMA,
  // What the customer has ALREADY paid, in minor units of the order's currency —
  // entered with the 'prepaid' payment status, so the page can show "paid X /
  // Y remaining" (the remainder is DERIVED from the total, never stored — the
  // same no-stale-snapshot rule as subtotal/total). Kept when the status later
  // moves to 'paid' (a history of how the money arrived), so it is not tied to
  // the status by the schema. Optional: pre-existing documents — and orders
  // without a prepayment — stay valid with no migration (widening is safe).
  prepaidAmountMinor: z.number().int().nonnegative().optional(),
  status: ORDER_STATUS_SCHEMA,
  // Marketplace the order came in from (today: Avito). Absent = a direct order —
  // see ORDER_SOURCE_SCHEMA for why this is an optional enum, not a boolean.
  source: ORDER_SOURCE_SCHEMA.optional(),
  comment: z.string().optional(),
  // When the order was completed (ms timestamp). An order is "completed" once it
  // reaches a terminal status (delivered or cancelled); this is stamped
  // automatically on that transition and cleared if it leaves one (see
  // resolveCompletedAt). Optional so orders that aren't finished — and any
  // written before this field existed — stay valid without a migration.
  completedAt: z.number().optional(),
  // Soft-delete timestamp (ms). Set when the order is moved to the trash; absent
  // for an active order. This is the CANONICAL "in trash" signal. Optional so an
  // active order — and any document written before this field — stays valid.
  // Distinct from "cancelled", which is an order status that keeps the order
  // visible. A trashed order stays in the trash indefinitely (the old 30-day TTL
  // auto-purge was removed by owner decision): it leaves only via Restore or the
  // trash page's explicit hard delete. See `isOrderDeleted`.
  deletedAt: z.number().optional(),
  // LEGACY soft-delete flag, superseded by `deletedAt`. Kept readable so an order
  // soft-deleted before the switch still counts as trashed (see `isOrderDeleted`)
  // — narrowing a stored field is unsafe (the `packing` lesson), so we keep
  // honouring it rather than dropping it. New deletions write `deletedAt`, not
  // this; `restoreOrder` clears both. A retired `purgeAt` Firestore Timestamp
  // (written by the removed auto-purge) may still sit on older trashed docs — it
  // is not read here, so the schema (which strips unknown keys) omits it, and
  // `restoreOrder` deletes it as lazy cleanup.
  isDeleted: z.boolean().optional(),
  // Storage paths of attached order photos, in display order. Each entry is a
  // PATH under `orders/{ownerId}/{orderId}/{photoId}.jpg` in Firebase Storage —
  // NOT a download URL (URLs are resolved lazily and their tokens can rotate, so
  // a stored URL would go stale). Optional and added after orders already
  // existed, so pre-existing orders stay valid without a migration (widening the
  // schema is safe; narrowing is not — see the `packing` lesson).
  photos: z.array(z.string()).optional(),
})

// A single order for potted plants and flowers = one table row. The doc id is
// added to the stored shape.
export type Order = z.infer<typeof STORED_ORDER_SCHEMA> & { id: string }

// Display label for an order's number. An order created offline has no number
// yet (null) until it syncs and reconcileOrderNumbers assigns one; show an em
// dash for that transient state so the UI never prints "№null".
export const formatOrderNumber = (number: number | null): string =>
  number === null ? '—' : String(number)

// True when an order is in the trash. `deletedAt` (set on soft-delete) is the
// canonical signal; the legacy boolean `isDeleted` is still honoured so an order
// trashed before `deletedAt` existed stays in the trash.
export const isOrderDeleted = (order: Order): boolean =>
  order.deletedAt !== undefined || order.isDeleted === true

// An order is "completed" once it is delivered or cancelled — both are terminal
// states with no further work to do on the order. Module-private: every outside
// consumer goes through isTerminalOrderStatus.
const TERMINAL_ORDER_STATUSES = ['delivered', 'cancelled'] as const

export const isTerminalOrderStatus = (status: OrderStatus): boolean =>
  (TERMINAL_ORDER_STATUSES as readonly OrderStatus[]).includes(status)

// The completion timestamp an order should carry for a given order status.
// Entering a terminal status stamps the completion time (keeping an existing
// stamp on a re-save, so the original completion moment survives); a
// non-terminal status clears it. Pure (takes `now`) so it stays unit-testable
// and is applied wherever the status is written — the create/edit form
// and the inline status save on the detail page.
export const resolveCompletedAt = (
  status: OrderStatus,
  previousCompletedAt: number | undefined,
  now: number,
): number | undefined =>
  isTerminalOrderStatus(status) ? (previousCompletedAt ?? now) : undefined

// Canonical option values, in display order. Status/method values keep their
// workflow order (e.g. processing → delivered). Labels are NOT stored here:
// they are resolved per render from the `order` i18n namespace, so the UI follows
// the chosen language (the latin value IS the translation key, so a value can
// never drift apart from its label).
export const PAYMENT_STATUS_VALUES = PAYMENT_STATUS_SCHEMA.options
export const ORDER_STATUS_VALUES = ORDER_STATUS_SCHEMA.options
export const PAYMENT_METHOD_VALUES = PAYMENT_METHOD_SCHEMA.options
export const DELIVERY_METHOD_VALUES = DELIVERY_METHOD_SCHEMA.options

// The derived read-side lives in sibling modules — selectors (money, plant
// lists, gift history) and the list filter — re-exported here so this module
// stays the single import surface for the order domain while the FILE stays
// about the stored schema. Their imports from here are type-only, so the
// re-export creates no runtime cycle.
export * from './orderSelectors'
export * from './orderFilter'
