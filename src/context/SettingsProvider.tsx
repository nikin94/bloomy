import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './authContext'
import { fetchSettings, saveSettings as persistSettings } from '@/firebase/settings'
import {
  clampFontScale,
  DEFAULT_CURRENCY,
  DEFAULT_DELIVERY_METHOD,
  DEFAULT_FONT_SCALE,
  DEFAULT_LANGUAGE,
  DEFAULT_PAYMENT_METHOD,
  DEFAULT_THEME,
} from '@/types/settings'
import type { Language, ThemeMode } from '@/types/settings'
import type { Currency, DeliveryMethod, PaymentMethod } from '@/types/order'
import i18n, { LANGUAGE_CACHE_KEY } from '@/i18n/config'
import { SettingsContext } from './settingsContext'
import type { SettingsDraft } from './settingsContext'

// localStorage key for the theme. The Firestore setting is the source of truth
// (cross-device); this cache lets the inline script in index.html paint the
// right theme before React runs — see that script.
const THEME_CACHE_KEY = 'bloomy-theme'

// Writes the font scale to the document root, where index.css reads it
// (`--font-scale`) to size the whole app. Kept out of React state so the slider
// can preview live without a re-render or a persist.
const applyFontScale = (scale: number) => {
  document.documentElement.style.setProperty('--font-scale', String(scale))
}

// Applies the theme to the document root (theme.css reads `data-theme`) and
// mirrors it to the localStorage cache so the next load paints it before React
// runs. Kept out of React state so the toggle can preview live.
const applyTheme = (theme: ThemeMode) => {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme)
  } catch {
    // Private mode / storage disabled: the theme still applies for this session,
    // it just won't be cached for the next load's first paint.
  }
}

// Switches the active UI language: tells i18next (re-rendering every translated
// component), sets <html lang> for the document, and mirrors it to the cache so
// the next load starts in the right language before React runs (see the inline
// script in index.html). Same shape as applyTheme so language previews live too.
const applyLanguage = (language: Language) => {
  void i18n.changeLanguage(language)
  document.documentElement.setAttribute('lang', language)
  try {
    localStorage.setItem(LANGUAGE_CACHE_KEY, language)
  } catch {
    // Private mode / storage disabled: applies for this session, just not cached.
  }
}

// Loads the signed-in user's settings, applies them app-wide, and exposes the
// preview/save controls the settings dialog uses. Sits under AuthProvider so it
// can scope settings to the current uid.
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const ownerId = user?.uid
  // The loaded values are tagged with the uid they belong to. Tagging (rather
  // than a bare value + a sign-out reset) means the active values derive to the
  // defaults the instant the uid changes — sign-out OR switching users — with no
  // stale flash while the next user's settings load, and no setState in an
  // effect (which React Compiler forbids).
  const [loaded, setLoaded] = useState<{
    ownerId: string
    scale: number
    theme: ThemeMode
    language: Language
    defaultDeliveryMethod: DeliveryMethod
    defaultPaymentMethod: PaymentMethod
    defaultCurrency: Currency
  } | null>(null)
  const applies = loaded && loaded.ownerId === ownerId
  const fontScale = applies ? loaded.scale : DEFAULT_FONT_SCALE
  const theme = applies ? loaded.theme : DEFAULT_THEME
  const language = applies ? loaded.language : DEFAULT_LANGUAGE
  const defaultDeliveryMethod = applies ? loaded.defaultDeliveryMethod : DEFAULT_DELIVERY_METHOD
  const defaultPaymentMethod = applies ? loaded.defaultPaymentMethod : DEFAULT_PAYMENT_METHOD
  const defaultCurrency = applies ? loaded.defaultCurrency : DEFAULT_CURRENCY

  // Fetch the signed-in user's saved settings. Tagging the result with ownerId
  // keeps a late response from a previous user from applying to the current one.
  useEffect(() => {
    if (!ownerId) return
    let active = true
    fetchSettings(ownerId)
      .then((settings) => {
        if (!active) return
        setLoaded({
          ownerId,
          scale: clampFontScale(settings.fontScale ?? DEFAULT_FONT_SCALE),
          theme: settings.theme ?? DEFAULT_THEME,
          language: settings.language ?? DEFAULT_LANGUAGE,
          defaultDeliveryMethod: settings.defaultDeliveryMethod ?? DEFAULT_DELIVERY_METHOD,
          defaultPaymentMethod: settings.defaultPaymentMethod ?? DEFAULT_PAYMENT_METHOD,
          defaultCurrency: settings.defaultCurrency ?? DEFAULT_CURRENCY,
        })
      })
      .catch(() => {
        // Non-fatal: fall back to the defaults already applied.
      })
    return () => {
      active = false
    }
  }, [ownerId])

  // Mirror the active values onto the document, where the CSS reads them. Driven
  // by state (not the fetch callback) so a uid change resets the document too.
  // Previews write to the document directly and don't touch state, so they
  // aren't clobbered until a save or uid change commits new values.
  useEffect(() => {
    applyFontScale(fontScale)
  }, [fontScale])
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
  // Unlike theme/font (a CSS flicker at worst), re-applying the language here on
  // mount would call i18n.changeLanguage and re-render every string. The cached
  // language already painted the first render (config.ts + the inline script read
  // it before React). So while a signed-in user's settings are still loading,
  // skip: applying the fallback default would flip the UI to ru AND stomp the
  // cache, then flip back once Firestore resolves — the en→ru→en flash. Apply
  // only authoritative values: a loaded setting, or a true signed-out reset.
  useEffect(() => {
    if (ownerId && !applies) return
    applyLanguage(language)
  }, [applies, ownerId, language])

  // Live-preview a value on the document without persisting (slider/toggle/select).
  // Stable identity (empty deps): they only call module-level document writers, so
  // the context value below keeps the same reference across renders.
  const previewFontScale = useCallback((scale: number) => applyFontScale(scale), [])
  const previewTheme = useCallback((next: ThemeMode) => applyTheme(next), [])
  const previewLanguage = useCallback((next: Language) => applyLanguage(next), [])

  // Persist to Firebase, then commit as the applied values. Throwing surfaces
  // the error to the dialog; the live preview already reflects the attempt.
  // Keyed on ownerId so it only re-creates when the signed-in user changes.
  const saveSettings = useCallback(
    async (next: SettingsDraft) => {
      if (!ownerId) return
      const scale = clampFontScale(next.fontScale)
      await persistSettings(ownerId, {
        fontScale: scale,
        theme: next.theme,
        language: next.language,
        defaultDeliveryMethod: next.defaultDeliveryMethod,
        defaultPaymentMethod: next.defaultPaymentMethod,
        defaultCurrency: next.defaultCurrency,
      })
      setLoaded({
        ownerId,
        scale,
        theme: next.theme,
        language: next.language,
        defaultDeliveryMethod: next.defaultDeliveryMethod,
        defaultPaymentMethod: next.defaultPaymentMethod,
        defaultCurrency: next.defaultCurrency,
      })
    },
    [ownerId],
  )

  // Memoised so the provider hands consumers the SAME object until a value it
  // depends on actually changes. This provider wraps the whole app, and a fresh
  // object every render would re-render every useSettings consumer regardless of
  // which slice they read — the discipline the header-actions/columns memos follow.
  const value = useMemo(
    () => ({
      fontScale,
      theme,
      language,
      defaultDeliveryMethod,
      defaultPaymentMethod,
      defaultCurrency,
      previewFontScale,
      previewTheme,
      previewLanguage,
      saveSettings,
    }),
    [
      fontScale,
      theme,
      language,
      defaultDeliveryMethod,
      defaultPaymentMethod,
      defaultCurrency,
      previewFontScale,
      previewTheme,
      previewLanguage,
      saveSettings,
    ],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
