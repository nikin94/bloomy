import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Select from '../Select/Select'

// The settings screen is split into sections shown one at a time behind these
// tabs, so its height stays roughly constant as settings accrue. The admin tab is
// appended only for an admin (the caller decides the `tabs` list).
export type SettingsTab = 'appearance' | 'orders' | 'account' | 'admin'

// Section navigation, responsive between two controls that drive the same
// selection. On phones a native <Select> — its current section's full label is
// always legible and a dropdown is the expected small-screen control. From 769px
// up, a VERTICAL sub-rail (a second-level nav beside the wide content panel): a
// vertical list stays narrow at any screen width, so the sections never stretch
// and the content takes the freed width — matching the main sidebar's language.
// A standalone ARIA tablist (roving-tabindex arrow-key navigation) that owns the
// tab refs + keyboard handling; the settings page just tracks the value.
const SettingsTabs = ({
  tabs,
  value,
  onChange,
}: {
  tabs: SettingsTab[]
  value: SettingsTab
  onChange: (next: SettingsTab) => void
}) => {
  const { t } = useTranslation('settings')
  // Refs to the tab buttons so arrow-key navigation can move focus onto the
  // newly-selected tab (roving tabindex: only the active tab is tabbable).
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({})

  const onTabKeyDown = (e: React.KeyboardEvent, key: SettingsTab) => {
    const idx = tabs.indexOf(key)
    let nextIdx: number | null = null
    // Vertical list → Up/Down are the primary keys; Left/Right kept working too so
    // either arrow pair moves between sections.
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = tabs.length - 1
    if (nextIdx === null) return
    e.preventDefault()
    const nextKey = tabs[nextIdx]
    onChange(nextKey)
    tabRefs.current[nextKey]?.focus()
  }

  return (
    <div>
      {/* Phone: section picker. */}
      <div className="min-[769px]:hidden">
        <Select
          aria-label={t('tabsAria')}
          value={value}
          onChange={(e) => onChange(e.target.value as SettingsTab)}
        >
          {tabs.map((key) => (
            <option key={key} value={key}>
              {t(`tabs.${key}` as const)}
            </option>
          ))}
        </Select>
      </div>

      {/* Desktop: a vertical sub-rail of sections. Deliberately a LIGHTER register
          than the main sidebar (which is font-medium with a solid bg-primary fill
          on the active row): here the labels are muted normal-weight text and the
          active row is accent-coloured on a soft bg-primary-bg tint, so the second
          level reads as subordinate to the main nav rather than a peer of it. */}
      <div
        role="tablist"
        aria-label={t('tabsAria')}
        aria-orientation="vertical"
        className="hidden flex-col gap-1 min-[769px]:flex"
      >
        {tabs.map((key) => {
          const selected = key === value
          return (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[key] = el
              }}
              type="button"
              role="tab"
              id={`settings-tab-${key}`}
              aria-selected={selected}
              aria-controls={`settings-panel-${key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(key)}
              onKeyDown={(e) => onTabKeyDown(e, key)}
              className={`flex items-center rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                selected
                  ? 'bg-primary-bg font-semibold text-primary'
                  : 'font-normal text-text hover:text-heading'
              }`}
            >
              {t(`tabs.${key}` as const)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default SettingsTabs
