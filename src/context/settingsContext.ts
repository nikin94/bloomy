import { createContext, useContext } from 'react'
import { DEFAULT_FONT_SCALE, DEFAULT_THEME } from '../types/settings'
import type { ThemeMode } from '../types/settings'

// Per-user app settings exposed to the app. `fontScale`/`theme` are the
// persisted, applied values; the `preview*` callbacks update the live document
// without persisting (so the dialog can preview a change and revert it on
// cancel), and `saveSettings` writes the chosen values to Firebase and commits
// them as applied.
export interface SettingsState {
  fontScale: number
  theme: ThemeMode
  previewFontScale: (scale: number) => void
  previewTheme: (theme: ThemeMode) => void
  saveSettings: (next: { fontScale: number; theme: ThemeMode }) => Promise<void>
}

export const SettingsContext = createContext<SettingsState>({
  fontScale: DEFAULT_FONT_SCALE,
  theme: DEFAULT_THEME,
  previewFontScale: () => {},
  previewTheme: () => {},
  saveSettings: async () => {},
})

export const useSettings = (): SettingsState => useContext(SettingsContext)
