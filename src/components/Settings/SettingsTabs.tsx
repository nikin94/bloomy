import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Select from '../Select/Select'

// The settings screen is split into sections shown one at a time behind these
// tabs, so its height stays roughly constant as settings accrue. The admin tab is
// appended only for an admin (the caller decides the `tabs` list).
export type SettingsTab = 'appearance' | 'orders' | 'account' | 'admin'

// Section navigation, responsive between two controls that drive the same
// selection. A horizontal scroll strip tested badly (no cue it scrolls), so
// instead: on phones a native <Select> — its current section's full label is
// always legible and a dropdown is the expected small-screen control; from
// 769px up, a segmented ARIA tablist (the labels fit as equal columns at that
// width) with roving-tabindex arrow-key navigation. A standalone control that owns
// the tab refs + keyboard handling; the settings page just tracks the value.
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
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length
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

      {/* Desktop: segmented tabs as equal columns (3 or 4) so the header reads
          as one control. */}
      <div
        role="tablist"
        aria-label={t('tabsAria')}
        className={`hidden gap-1 rounded-lg border border-border bg-primary-bg p-1 min-[769px]:grid ${
          tabs.length === 4 ? 'min-[769px]:grid-cols-4' : 'min-[769px]:grid-cols-3'
        }`}
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
              className={`truncate rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                selected ? 'bg-bg text-heading shadow-sm' : 'text-text hover:text-heading'
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
