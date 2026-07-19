import { createContext, useContext } from 'react'
import {
  DEFAULT_CURRENCY,
  DEFAULT_DELIVERY_METHOD,
  DEFAULT_FONT_SCALE,
  DEFAULT_LANGUAGE,
  DEFAULT_PAYMENT_METHOD,
  DEFAULT_THEME,
} from '@/types/settings'
import type { Language, ThemeMode } from '@/types/settings'
import type { Currency, DeliveryMethod, PaymentMethod } from '@/types/order'

// The full settings set a save writes. The settings page saves on every field
// change (autosave — no Save/Cancel buttons), passing the current values with
// the one changed field swapped in.
export interface SettingsDraft {
  fontScale: number
  theme: ThemeMode
  language: Language
  defaultDeliveryMethod: DeliveryMethod
  defaultPaymentMethod: PaymentMethod
  defaultCurrency: Currency
}

// Per-user app settings exposed to the app. `fontScale`/`theme` are the
// persisted, applied values; the order defaults seed a new order's form.
// `saveSettings` commits the values as applied IMMEDIATELY (the app re-themes/
// re-scales in place) and persists to Firebase in the background — synchronous
// from the caller's perspective, offline-safe like every other mutation.
export interface SettingsState {
  fontScale: number
  theme: ThemeMode
  language: Language
  defaultDeliveryMethod: DeliveryMethod
  defaultPaymentMethod: PaymentMethod
  defaultCurrency: Currency
  saveSettings: (next: SettingsDraft) => void
}

export const SettingsContext = createContext<SettingsState>({
  fontScale: DEFAULT_FONT_SCALE,
  theme: DEFAULT_THEME,
  language: DEFAULT_LANGUAGE,
  defaultDeliveryMethod: DEFAULT_DELIVERY_METHOD,
  defaultPaymentMethod: DEFAULT_PAYMENT_METHOD,
  defaultCurrency: DEFAULT_CURRENCY,
  saveSettings: () => {},
})

export const useSettings = (): SettingsState => useContext(SettingsContext)
