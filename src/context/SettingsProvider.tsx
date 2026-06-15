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
  // The loaded value is tagged with the uid it belongs to. Tagging (rather than a
  // bare scale + a sign-out reset) means the active scale derives to the default
  // the instant the uid changes — sign-out OR switching users — with no stale
  // flash while the next user's settings load, and no setState in an effect
  // (which React Compiler forbids).
  const [loaded, setLoaded] = useState<{ ownerId: string; scale: number } | null>(null)
  const fontScale =
    loaded && loaded.ownerId === ownerId ? loaded.scale : DEFAULT_FONT_SCALE

  // Fetch the signed-in user's saved size. Tagging the result with ownerId keeps
  // a late response from a previous user from applying to the current one.
  useEffect(() => {
    if (!ownerId) return
    let active = true
    fetchSettings(ownerId)
      .then((settings) => {
        if (!active) return
        setLoaded({ ownerId, scale: clampFontScale(settings.fontScale ?? DEFAULT_FONT_SCALE) })
      })
      .catch(() => {
        // Non-fatal: fall back to the default size already applied.
      })
    return () => {
      active = false
    }
  }, [ownerId])

  // Mirror the active scale onto the document root, where index.css reads it.
  // Driven by state (not the fetch callback) so a uid change resets the document
  // too. Slider previews write the variable directly and don't touch state, so
  // they aren't clobbered until a save or uid change commits a new scale.
  useEffect(() => {
    applyFontScale(fontScale)
  }, [fontScale])

  // Live-preview a size on the document without persisting (slider drag).
  const previewFontScale = (scale: number) => applyFontScale(scale)

  // Persist to Firebase, then commit as the applied value. Throwing surfaces the
  // error to the dialog; the live preview already reflects the attempted size.
  const saveFontScale = async (scale: number) => {
    const clamped = clampFontScale(scale)
    if (!ownerId) return
    await saveSettings(ownerId, { fontScale: clamped })
    setLoaded({ ownerId, scale: clamped })
  }

  return (
    <SettingsContext.Provider value={{ fontScale, previewFontScale, saveFontScale }}>
      {children}
    </SettingsContext.Provider>
  )
}
