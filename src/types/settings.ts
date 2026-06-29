import { z } from 'zod'
import { CURRENCY_SCHEMA, DELIVERY_METHOD_SCHEMA, PAYMENT_METHOD_SCHEMA } from './order'
import type { Currency, DeliveryMethod, PaymentMethod } from './order'

// Per-user font-size multiplier applied to the whole app's base size (index.css
// reads it as `--font-scale`). Discrete steps so the slider snaps like the iOS
// text-size control; DEFAULT is the unscaled baseline.
export const FONT_SCALE_MIN = 0.875
export const FONT_SCALE_MAX = 1.375
export const FONT_SCALE_STEP = 0.125
export const DEFAULT_FONT_SCALE = 1

// Keep a read (or hand-edited) value inside the supported range, so a stale
// document can never blow up the layout.
export const clampFontScale = (scale: number): number =>
  Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale))

// Colour theme. DARK is the default — applied when the user has not chosen a
// theme yet (no saved value), per the product decision, rather than following
// the OS `prefers-color-scheme`.
export const THEME_MODES = ['light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]
export const DEFAULT_THEME: ThemeMode = 'dark'

// UI language. Russian is the default (the current users); English is the
// alternate. Stored per-user like the theme; the i18n layer (src/i18n) maps the
// code to its dictionaries and to `Intl` locale formatting.
export const LANGUAGES = ['ru', 'en'] as const
export type Language = (typeof LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'ru'

// Defaults used to prefill a NEW order's delivery/payment method when the user
// has not set a preference: post (Почта) for delivery, card (Карта) for payment.
export const DEFAULT_DELIVERY_METHOD: DeliveryMethod = 'post'
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'card'

// Currency a NEW order starts in when the user has not chosen one. Roubles, the
// current operator's currency; an order can still be switched per-order.
export const DEFAULT_CURRENCY: Currency = 'RUB'

// Per-user app settings, stored at settings/{uid} (the doc id IS the owner uid,
// like counters). Every field is optional so a document written before a field
// existed stays valid and missing fields fall back to defaults.
export const STORED_SETTINGS_SCHEMA = z.object({
  fontScale: z.number().optional(),
  theme: z.enum(THEME_MODES).optional(),
  // UI language. Optional so settings written before it existed stay valid;
  // SettingsProvider falls back to DEFAULT_LANGUAGE when unset.
  language: z.enum(LANGUAGES).optional(),
  // New-order prefill preferences. Optional so settings written before they
  // existed stay valid; OrderForm falls back to the constants above when unset.
  defaultDeliveryMethod: DELIVERY_METHOD_SCHEMA.optional(),
  defaultPaymentMethod: PAYMENT_METHOD_SCHEMA.optional(),
  // Currency a new order starts in. Optional/prod-safe; falls back to RUB.
  defaultCurrency: CURRENCY_SCHEMA.optional(),
})

export type StoredSettings = z.infer<typeof STORED_SETTINGS_SCHEMA>
