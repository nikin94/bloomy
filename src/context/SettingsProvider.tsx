import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './authContext'
import { fetchSettings, saveSettings } from '../firebase/settings'
import { clampFontScale, DEFAULT_FONT_SCALE } from '../types/settings'
import { SettingsContext } from './settingsContext'

// Writes the font scale to the document root, where index.css reads it
// (`--font-scale`) to size the whole app. Kept out of React state so the slider
// can preview live without a re-render or a persist.
const applyFontScale = (scale: number) => {
  document.documentElement.style.setProperty('--font-scale', String(scale))
}

// Loads the signed-in user's settings, applies them app-wide, and exposes the
// preview/save controls the settings dialog uses. Sits under AuthProvider so it
// can scope settings to the current uid.
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const ownerId = user?.uid
  const [fontScale, setFontScale] = useState(DEFAULT_FONT_SCALE)

  // Apply the current user's saved size, and reset the document to the default on
  // sign-out so one user's preference never carries over visually to the next.
  // Only the async `.then` mutates state (state can't be set synchronously in an
  // effect); the signed-out path just resets the DOM variable, which is enough
  // because the settings dialog is unreachable while signed out.
  useEffect(() => {
    if (!ownerId) {
      applyFontScale(DEFAULT_FONT_SCALE)
      return
    }
    let active = true
    fetchSettings(ownerId)
      .then((settings) => {
        if (!active) return
        const scale = clampFontScale(settings.fontScale ?? DEFAULT_FONT_SCALE)
        setFontScale(scale)
        applyFontScale(scale)
      })
      .catch(() => {
        // Non-fatal: fall back to the default size already applied.
      })
    return () => {
      active = false
    }
  }, [ownerId])

  // Live-preview a size on the document without persisting (slider drag).
  const previewFontScale = (scale: number) => applyFontScale(scale)

  // Persist to Firebase, then commit as the applied value. Throwing surfaces the
  // error to the dialog; the live preview already reflects the attempted size.
  const saveFontScale = async (scale: number) => {
    const clamped = clampFontScale(scale)
    if (ownerId) await saveSettings(ownerId, { fontScale: clamped })
    setFontScale(clamped)
    applyFontScale(clamped)
  }

  return (
    <SettingsContext.Provider value={{ fontScale, previewFontScale, saveFontScale }}>
      {children}
    </SettingsContext.Provider>
  )
}
