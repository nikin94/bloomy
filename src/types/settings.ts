import { z } from 'zod'

// Per-user font-size multiplier applied to the whole app's base size (index.css
// reads it as `--font-scale`). Discrete steps so the slider snaps like the iOS
// text-size control; DEFAULT is the unscaled baseline.
export const FONT_SCALE_MIN = 0.875
export const FONT_SCALE_MAX = 1.375
export const FONT_SCALE_STEP = 0.125
export const DEFAULT_FONT_SCALE = 1

// Keep a read (or hand-edited) value inside the supported range, so a stale
// document can never blow up the layout.
export const clampFontScale = (scale: number): number =>
  Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale))

// Colour theme. DARK is the default — applied when the user has not chosen a
// theme yet (no saved value), per the product decision, rather than following
// the OS `prefers-color-scheme`.
export const THEME_MODES = ['light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]
export const DEFAULT_THEME: ThemeMode = 'dark'

// Per-user app settings, stored at settings/{uid} (the doc id IS the owner uid,
// like counters). Every field is optional so a document written before a field
// existed stays valid and missing fields fall back to defaults.
export const STORED_SETTINGS_SCHEMA = z.object({
  fontScale: z.number().optional(),
  theme: z.enum(THEME_MODES).optional(),
})

export type StoredSettings = z.infer<typeof STORED_SETTINGS_SCHEMA>
