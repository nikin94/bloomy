import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, LANGUAGES } from '@/types/settings'
import type { Language } from '@/types/settings'
import ruCommon from '@/i18n/locales/ru/common.json'
import ruNav from '@/i18n/locales/ru/nav.json'
import ruSettings from '@/i18n/locales/ru/settings.json'
import ruOrder from '@/i18n/locales/ru/order.json'
import ruCustomer from '@/i18n/locales/ru/customer.json'
import ruStats from '@/i18n/locales/ru/stats.json'
import ruAuth from '@/i18n/locales/ru/auth.json'
import enCommon from '@/i18n/locales/en/common.json'
import enNav from '@/i18n/locales/en/nav.json'
import enSettings from '@/i18n/locales/en/settings.json'
import enOrder from '@/i18n/locales/en/order.json'
import enCustomer from '@/i18n/locales/en/customer.json'
import enStats from '@/i18n/locales/en/stats.json'
import enAuth from '@/i18n/locales/en/auth.json'

// localStorage key shared by the index.html no-flash script and SettingsProvider
// so the chosen language is restored BEFORE React runs — mirrors the theme cache.
export const LANGUAGE_CACHE_KEY = 'bloomy-lang'

// All UI strings, BUNDLED (imported, not fetched over HTTP). Bundling means the
// dictionaries ride the service-worker-precached app shell, so the app
// translates offline with no extra network or SW config. One namespace per area
// keeps each dictionary small and reviewable. Russian is the complete set
// (English may omit plural forms a locale doesn't need — i18next falls back).
export const resources = {
  ru: {
    common: ruCommon,
    nav: ruNav,
    settings: ruSettings,
    order: ruOrder,
    customer: ruCustomer,
    stats: ruStats,
    auth: ruAuth,
  },
  en: {
    common: enCommon,
    nav: enNav,
    settings: enSettings,
    order: enOrder,
    customer: enCustomer,
    stats: enStats,
    auth: enAuth,
  },
} as const

export const defaultNS = 'common'

// Read the cached language synchronously so the first render is already in the
// right language (no ru→en flash). The Firestore setting is the source of truth
// and reconciles this once SettingsProvider loads it. Defaults to ru.
const cachedLanguage = ((): Language => {
  try {
    const value = localStorage.getItem(LANGUAGE_CACHE_KEY)
    return (LANGUAGES as readonly string[]).includes(value ?? '')
      ? (value as Language)
      : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
})()

// Resources are inline, so init is synchronous (no Suspense, no loading flash).
void i18n.use(initReactI18next).init({
  resources,
  lng: cachedLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS,
  ns: ['common', 'nav', 'settings', 'order', 'customer', 'stats', 'auth'],
  // React already escapes interpolated values; don't let i18next double-escape.
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

export default i18n
