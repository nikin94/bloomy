import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './authContext'
import { fetchSettings, saveSettings as persistSettings } from '../firebase/settings'
import { clampFontScale, DEFAULT_FONT_SCALE, DEFAULT_THEME } from '../types/settings'
import type { ThemeMode } from '../types/settings'
import { SettingsContext } from './settingsContext'

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
  } | null>(null)
  const applies = loaded && loaded.ownerId === ownerId
  const fontScale = applies ? loaded.scale : DEFAULT_FONT_SCALE
  const theme = applies ? loaded.theme : DEFAULT_THEME

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

  // Live-preview a value on the document without persisting (slider/toggle).
  const previewFontScale = (scale: number) => applyFontScale(scale)
  const previewTheme = (next: ThemeMode) => applyTheme(next)

  // Persist to Firebase, then commit as the applied values. Throwing surfaces
  // the error to the dialog; the live preview already reflects the attempt.
  const saveSettings = async (next: { fontScale: number; theme: ThemeMode }) => {
    if (!ownerId) return
    const scale = clampFontScale(next.fontScale)
    await persistSettings(ownerId, { fontScale: scale, theme: next.theme })
    setLoaded({ ownerId, scale, theme: next.theme })
  }

  return (
    <SettingsContext.Provider
      value={{ fontScale, theme, previewFontScale, previewTheme, saveSettings }}
    >
      {children}
    </SettingsContext.Provider>
  )
}
