import { createContext, useContext } from 'react'
import { DEFAULT_FONT_SCALE } from '../types/settings'

// Per-user app settings exposed to the app. `fontScale` is the persisted,
// applied size multiplier; `previewFontScale` updates the live document without
// persisting (slider drag), and `saveFontScale` writes to Firebase and commits.
export interface SettingsState {
  fontScale: number
  previewFontScale: (scale: number) => void
  saveFontScale: (scale: number) => Promise<void>
}

export const SettingsContext = createContext<SettingsState>({
  fontScale: DEFAULT_FONT_SCALE,
  previewFontScale: () => {},
  saveFontScale: async () => {},
})

export const useSettings = (): SettingsState => useContext(SettingsContext)
