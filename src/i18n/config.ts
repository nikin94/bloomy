import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, LANGUAGES } from '../types/settings'
import type { Language } from '../types/settings'
import ruCommon from './locales/ru/common.json'
import ruNav from './locales/ru/nav.json'
import ruSettings from './locales/ru/settings.json'
import enCommon from './locales/en/common.json'
import enNav from './locales/en/nav.json'
import enSettings from './locales/en/settings.json'

// localStorage key shared by the index.html no-flash script and SettingsProvider
// so the chosen language is restored BEFORE React runs — mirrors the theme cache.
export const LANGUAGE_CACHE_KEY = 'bloomy-lang'

// All UI strings, BUNDLED (imported, not fetched over HTTP). Bundling means the
// dictionaries ride the service-worker-precached app shell, so the app
// translates offline with no extra network or SW config. One namespace per area
// keeps each dictionary small and reviewable. Russian is the complete set
// (English may omit plural forms a locale doesn't need — i18next falls back).
export const resources = {
  ru: { common: ruCommon, nav: ruNav, settings: ruSettings },
  en: { common: enCommon, nav: enNav, settings: enSettings },
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
  ns: ['common', 'nav', 'settings'],
  // React already escapes interpolated values; don't let i18next double-escape.
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

export default i18n
