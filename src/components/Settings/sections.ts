// The settings sections, shared by the sidebar (which now owns the section nav —
// a flyout on desktop, a drawer accordion on mobile) and the settings page (which
// renders the active section's content). The active section travels in the URL as
// `?section=<key>` so it survives a refresh and is linkable; both the nav and the
// page read it from there, keeping a single source of truth.
export const SETTINGS_SECTIONS = ['appearance', 'orders', 'account', 'admin'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

// The sections visible to a given account: the admin section only for an admin.
export const settingsSectionsFor = (adminUser: boolean): SettingsSection[] =>
  adminUser ? ['appearance', 'orders', 'account', 'admin'] : ['appearance', 'orders', 'account']

// Narrow an arbitrary `?section=` value to a real section, so a stray/spoofed
// param (or the admin section for a non-admin) can't select an unknown panel.
export const isSettingsSection = (value: string | null): value is SettingsSection =>
  value !== null && (SETTINGS_SECTIONS as readonly string[]).includes(value)
