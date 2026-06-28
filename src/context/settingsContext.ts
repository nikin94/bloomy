import { createContext, useContext } from 'react'
import {
  DEFAULT_DELIVERY_METHOD,
  DEFAULT_FONT_SCALE,
  DEFAULT_LANGUAGE,
  DEFAULT_PAYMENT_METHOD,
  DEFAULT_THEME,
} from '../types/settings'
import type { Language, ThemeMode } from '../types/settings'
import type { DeliveryMethod, PaymentMethod } from '../types/order'

// The settings persisted by the dialog's Save. Theme/font/language preview live
// before they are saved; the order defaults don't change the live app (they only
// seed the next new order), so they have no preview — they apply on Save.
export interface SettingsDraft {
  fontScale: number
  theme: ThemeMode
  language: Language
  defaultDeliveryMethod: DeliveryMethod
  defaultPaymentMethod: PaymentMethod
}

// Per-user app settings exposed to the app. `fontScale`/`theme` are the
// persisted, applied values; the order defaults seed a new order's form; the
// `preview*` callbacks update the live document without persisting (so the
// dialog can preview a change and revert it on cancel), and `saveSettings`
// writes the chosen values to Firebase and commits them as applied.
export interface SettingsState {
  fontScale: number
  theme: ThemeMode
  language: Language
  defaultDeliveryMethod: DeliveryMethod
  defaultPaymentMethod: PaymentMethod
  previewFontScale: (scale: number) => void
  previewTheme: (theme: ThemeMode) => void
  previewLanguage: (language: Language) => void
  saveSettings: (next: SettingsDraft) => Promise<void>
}

export const SettingsContext = createContext<SettingsState>({
  fontScale: DEFAULT_FONT_SCALE,
  theme: DEFAULT_THEME,
  language: DEFAULT_LANGUAGE,
  defaultDeliveryMethod: DEFAULT_DELIVERY_METHOD,
  defaultPaymentMethod: DEFAULT_PAYMENT_METHOD,
  previewFontScale: () => {},
  previewTheme: () => {},
  previewLanguage: () => {},
  saveSettings: async () => {},
})

export const useSettings = (): SettingsState => useContext(SettingsContext)
