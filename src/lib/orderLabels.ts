import i18next, { type TFunction } from 'i18next'
import { currencySymbol } from '@/utils/format'
import {
  CURRENCIES,
  DELIVERY_METHOD_VALUES,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS_VALUES,
  SHIPMENT_STATUS_VALUES,
} from '@/types/order'
import type {
  Currency,
  DeliveryMethod,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
} from '@/types/order'

// The i18n layer for orders: turns the stored latin status/method/currency VALUES
// (the canonical source, kept in types/order alongside the schema) into localized
// labels and { value, label } option lists for the language the UI is in. Split
// out of types/order so the domain type module stays free of i18next — labels are
// a presentation concern, resolved per render, never stored.

// A translate function bound to the `order` namespace (from
// `useTranslation('order')`). Typed this way so the keys below are checked
// against order.json at compile time, not just at runtime.
export type OrderT = TFunction<'order'>

// Translated label for a single status/method value. The latin value IS the
// key's leaf, so the union of values maps to a union of valid keys (type-safe).
export const paymentStatusLabel = (t: OrderT, value: PaymentStatus): string =>
  t(`paymentStatus.${value}`)
export const shipmentStatusLabel = (t: OrderT, value: ShipmentStatus): string =>
  t(`shipmentStatus.${value}`)
export const paymentMethodLabel = (t: OrderT, value: PaymentMethod): string =>
  t(`paymentMethod.${value}`)
export const deliveryMethodLabel = (t: OrderT, value: DeliveryMethod): string =>
  t(`deliveryMethod.${value}`)
// Currency option label: the localized NAME plus the universal symbol glyph, e.g.
// "Rubles (₽)" / "Dollars ($)". The name is translated (order ns); the symbol
// comes from currencySymbol (the same Intl source formatMoney uses) so the value
// in the dropdown and a formatted amount can never disagree on the symbol.
export const currencyLabel = (t: OrderT, value: Currency): string =>
  `${t(`currency.${value}`)} (${currencySymbol(value)})`

// { value, label } option lists for native <select>, built per render in the
// active language. Functions (not constants) because the label is locale-
// dependent; the consuming component re-renders on a language change (via its own
// useTranslation), so the options rebuild with the new labels.
export const paymentStatusOptions = (t: OrderT) =>
  PAYMENT_STATUS_VALUES.map((value) => ({ value, label: paymentStatusLabel(t, value) }))
export const shipmentStatusOptions = (t: OrderT) =>
  SHIPMENT_STATUS_VALUES.map((value) => ({ value, label: shipmentStatusLabel(t, value) }))
export const paymentMethodOptions = (t: OrderT) =>
  PAYMENT_METHOD_VALUES.map((value) => ({ value, label: paymentMethodLabel(t, value) }))
export const currencyOptions = (t: OrderT) =>
  CURRENCIES.map((value) => ({ value, label: currencyLabel(t, value) }))
// Delivery methods have no natural order, so sort by the TRANSLATED label (the
// order the user reads), with the "other" catch-all pinned last regardless.
export const deliveryMethodOptions = (t: OrderT) =>
  DELIVERY_METHOD_VALUES.map((value) => ({ value, label: deliveryMethodLabel(t, value) })).sort(
    (a, b) => {
      if (a.value === 'other') return 1
      if (b.value === 'other') return -1
      // Sort by the active UI locale so the alphabetical order is right for the
      // language the labels are in (i18next is the same singleton config inits).
      return a.label.localeCompare(b.label, i18next.language)
    },
  )
