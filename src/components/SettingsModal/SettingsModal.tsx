import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/authContext'
import { useSettings } from '../../context/settingsContext'
import { signOutUser } from '../../firebase/auth'
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP, LANGUAGES } from '../../types/settings'
import type { Language, ThemeMode } from '../../types/settings'
import { currencyOptions, deliveryMethodOptions, paymentMethodOptions } from '../../types/order'
import type { Currency, DeliveryMethod, PaymentMethod } from '../../types/order'
import Button from '../Button/Button'
import Select from '../Select/Select'
import Modal from '../Modal/Modal'
import AdminSeedSection from './AdminSeedSection'
import { isAdmin } from '../../lib/admin'

// Number of discrete positions on the slider (one notch each), so the iOS-style
// ticks below the track always match the actual snap points.
const SCALE_STEPS = Math.round((FONT_SCALE_MAX - FONT_SCALE_MIN) / FONT_SCALE_STEP) + 1

// Custom-styled range: the native `accent-color` thumb can't be resized, so we
// strip the appearance and draw our own. The thumb is enlarged (size-6) for an
// easy grab and ringed with the background so it reads as a knob riding over the
// step ticks; `-mt-2.5` re-centres the 24px thumb on the 4px track. Stays a real
// <input type="range">, so its slider role / keyboard control are unchanged.
const sliderClass =
  // `block` removes the inline-block descender gap below the input, so the
  // wrapper's height matches the track and the step ticks centre on it exactly.
  'relative block h-6 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none ' +
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border ' +
  '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border ' +
  '[&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10 [&::-webkit-slider-thumb]:-mt-2.5 [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow ' +
  '[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-bg [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow'

// Translation key (under settings:fontScale) describing the current scale for
// screen readers, so the slider announces "уменьшен"/"по умолчанию"/"увеличен"
// (localised) rather than a raw number.
const fontScaleLabelKey = (scale: number): 'decreased' | 'default' | 'increased' => {
  if (scale < 1) return 'decreased'
  if (scale > 1) return 'increased'
  return 'default'
}

const SunIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-4"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
)

const MoonIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-4"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

// Theme switch styled as a pill track with a sun (light) and a moon (dark) at
// its ends; the sliding knob carries the ACTIVE theme's icon, so the visible
// track icon is the other option. A real `role="switch"` (checked = dark) so it
// is keyboard- and screen-reader-operable.
const ThemeToggle = ({
  value,
  label,
  onChange,
}: {
  value: ThemeMode
  label: string
  onChange: (next: ThemeMode) => void
}) => {
  const isDark = value === 'dark'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      onClick={() => onChange(isDark ? 'light' : 'dark')}
      className="relative inline-flex h-9 w-[4.5rem] shrink-0 items-center rounded-full border border-border bg-primary-bg p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {/* Track icons at each end (the not-selected option stays visible). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-between px-2 text-text"
      >
        <SunIcon />
        <MoonIcon />
      </span>
      {/* Sliding knob carrying the active theme's icon. */}
      <span
        className={`relative z-10 flex size-7 items-center justify-center rounded-full bg-bg text-primary shadow transition-transform ${
          isDark ? 'translate-x-[2.25rem]' : 'translate-x-0'
        }`}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  )
}

const LogoutIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-5"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

// A rounded card grouping its rows; adjacent rows get a top hairline divider.
const Group = ({ children }: { children: ReactNode }) => (
  <div className="overflow-hidden rounded-lg border border-border [&>*+*]:border-t [&>*+*]:border-border">
    {children}
  </div>
)

// One settings row: label on the left, control on the right. The label stays on
// one line (shrink-0 + nowrap) so a wide control can't squeeze it into a wrap.
// When `changed` is true (the draft differs from the saved value) the whole row
// is tinted so an unsaved edit is visible at a glance before Save.
const Row = ({
  label,
  changed,
  children,
}: {
  label: string
  changed?: boolean
  children: ReactNode
}) => (
  <div
    className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
      changed ? 'bg-accent-bg' : ''
    }`}
  >
    <span className="shrink-0 whitespace-nowrap text-sm font-medium text-heading">{label}</span>
    {children}
  </div>
)

// The settings dialog is split into sections shown one at a time behind header
// tabs, so the dialog's height stays roughly constant as settings accrue (it
// used to grow into a long scroll). The admin tab is appended only for an admin.
type SettingsTab = 'appearance' | 'orders' | 'account' | 'admin'

// Mounts the dialog only while open, so each opening starts from the persisted
// values (drafts are seeded from the applied settings on mount) without a reset
// effect.
const SettingsModal = ({ open, onClose }: { open: boolean; onClose: () => void }) =>
  open ? <SettingsDialog onClose={onClose} /> : null

// Settings dialog body. Holds the colour theme (a sun/moon switch), the per-user
// font size (an iOS-style size slider), language, the new-order defaults, the
// account (name + sign-out) and the admin seeder — grouped under header tabs.
// The shared Modal owns the shell (dialog role, backdrop, Escape, focus trap,
// header). Theme/font/language update the whole app immediately for preview, but
// are only persisted on "Сохранить"; dismissing reverts the live preview to the
// saved values. Dismissing with unsaved changes (via X / Escape / backdrop) asks
// for confirmation first so a stray click can't silently discard edits.
const SettingsDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation(['settings', 'common'])
  // The default-method pickers show order-domain labels (delivery/payment
  // methods + currency), which live in the `order` namespace — a separate bound t.
  const { t: tOrder } = useTranslation('order')
  const { user } = useAuth()
  const {
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
  } = useSettings()
  const [fontDraft, setFontDraft] = useState(fontScale)
  const [themeDraft, setThemeDraft] = useState(theme)
  const [languageDraft, setLanguageDraft] = useState(language)
  // The order defaults don't change the live app, so they have no preview —
  // they apply on Save. Kept as drafts so Cancel discards an unsaved change.
  const [deliveryDraft, setDeliveryDraft] = useState(defaultDeliveryMethod)
  const [paymentDraft, setPaymentDraft] = useState(defaultPaymentMethod)
  const [currencyDraft, setCurrencyDraft] = useState(defaultCurrency)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The admin tab exists only for an admin account.
  const adminUser = isAdmin(user?.uid) && user !== null
  const tabs: SettingsTab[] = adminUser
    ? ['appearance', 'orders', 'account', 'admin']
    : ['appearance', 'orders', 'account']
  const [tab, setTab] = useState<SettingsTab>('appearance')
  // Refs to the tab buttons so arrow-key navigation can move focus onto the
  // newly-selected tab (roving tabindex: only the active tab is tabbable).
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({})

  // Per-setting dirty flags: each marks one row as edited-but-unsaved, so its row
  // is tinted (see Row's `changed`). Their OR is the overall dirty state that
  // drives the discard guard.
  const fontChanged = fontDraft !== fontScale
  const themeChanged = themeDraft !== theme
  const languageChanged = languageDraft !== language
  const deliveryChanged = deliveryDraft !== defaultDeliveryMethod
  const paymentChanged = paymentDraft !== defaultPaymentMethod
  const currencyChanged = currencyDraft !== defaultCurrency
  const isDirty =
    fontChanged ||
    themeChanged ||
    languageChanged ||
    deliveryChanged ||
    paymentChanged ||
    currencyChanged

  // True while the "discard unsaved changes?" confirmation is shown.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const confirmRef = useRef<HTMLDivElement>(null)
  // The control the user was on before the confirm opened, so dismissing the
  // confirm ("keep editing") returns focus exactly there instead of dropping it
  // to document.body (the focused button gets unmounted with the confirm card).
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  // Drive focus across the confirm's appearance/dismissal. On open, move focus to
  // its first (safe) button so the keyboard lands on it rather than on a now-inert
  // control behind the overlay. On dismissal, restore focus to the remembered
  // control — run from an effect (after commit) so the body's `inert` is already
  // lifted and the target is focusable again.
  useEffect(() => {
    if (confirmingDiscard) {
      confirmRef.current?.querySelector('button')?.focus()
    } else if (lastFocusedRef.current) {
      lastFocusedRef.current.focus()
      lastFocusedRef.current = null
    }
  }, [confirmingDiscard])

  // Drop the live preview back to the persisted values, then close.
  const reallyClose = () => {
    previewFontScale(fontScale)
    previewTheme(theme)
    previewLanguage(language)
    onClose()
  }

  // The Modal's dismissal routes (X / Escape / backdrop) come through here. With
  // unsaved changes we intercept and confirm first; while the confirm is already
  // open, a second dismissal backs out of it (Escape/backdrop = "keep editing").
  // The explicit "Отмена" button bypasses this — it IS the discard affordance, so
  // double-confirming a button literally named "cancel" would only annoy.
  const requestClose = () => {
    if (confirmingDiscard) {
      setConfirmingDiscard(false)
      return
    }
    if (isDirty) {
      // Remember where focus was so "keep editing" can return it there.
      lastFocusedRef.current = document.activeElement as HTMLElement | null
      setConfirmingDiscard(true)
      return
    }
    reallyClose()
  }

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
    setTab(nextKey)
    tabRefs.current[nextKey]?.focus()
  }

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value)
    setFontDraft(next)
    previewFontScale(next) // live page update; not persisted until "Сохранить"
  }

  const handleTheme = (next: ThemeMode) => {
    setThemeDraft(next)
    previewTheme(next) // live page update; not persisted until "Сохранить"
  }

  const handleLanguage = (next: Language) => {
    setLanguageDraft(next)
    previewLanguage(next) // re-renders the whole app live; persisted on Save
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveSettings({
        fontScale: fontDraft,
        theme: themeDraft,
        language: languageDraft,
        defaultDeliveryMethod: deliveryDraft,
        defaultPaymentMethod: paymentDraft,
        defaultCurrency: currencyDraft,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings:saveError'))
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    // signOut is a local operation (clears the persisted session, no network
    // request), so it works offline and almost never fails. But if it does, the
    // user must SEE it — otherwise they think they signed out while the session
    // is still live. Await it, surface any failure inline, and close only on
    // success (a successful sign-out unmounts this dialog via the auth change
    // anyway, so the explicit close is just belt-and-suspenders).
    setError(null)
    try {
      await signOutUser()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings:signOutError'))
    }
  }

  return (
    // Slightly wider than the default form dialog so the four-tab header (with the
    // admin tab) fits each label on one line without truncating "Оформление".
    <Modal title={t('settings:title')} onClose={requestClose} widthClassName="max-w-lg">
      {/* The settings body is made inert while the discard confirmation is up, so
          only the confirm card is interactive (and it visually dims behind it). */}
      <div inert={confirmingDiscard} className="flex flex-col gap-6">
        {/* Section tabs. Roving tabindex + arrow-key navigation per the ARIA tabs
            pattern; equal-width segments so the header reads as one control. */}
        <div
          role="tablist"
          aria-label={t('settings:tabsAria')}
          className={`grid ${tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-1 rounded-lg border border-border bg-primary-bg p-1`}
        >
          {tabs.map((key) => {
            const selected = key === tab
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
                onClick={() => setTab(key)}
                onKeyDown={(e) => onTabKeyDown(e, key)}
                className={`truncate rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  selected ? 'bg-bg text-heading shadow-sm' : 'text-text hover:text-heading'
                }`}
              >
                {t(`settings:tabs.${key}` as const)}
              </button>
            )
          })}
        </div>

        {/* A fixed min-height sized to the tallest everyday tab (appearance /
            orders, three rows each) so the dialog doesn't jump as the user switches
            tabs — a shorter tab (account) just pads to the same height. BUMP THIS
            whenever a tab gains rows and grows past it: the value must stay ≥ the
            tallest everyday tab, otherwise that tab nudges the dialog height again. */}
        <div
          role="tabpanel"
          id={`settings-panel-${tab}`}
          aria-labelledby={`settings-tab-${tab}`}
          className="flex min-h-[14rem] flex-col gap-2"
        >
          {tab === 'appearance' && (
            <Group>
              {/* Theme: a sun/moon switch on the right. The icons are
                  self-explanatory, so the row's text label carries the name; the
                  switch's accessible name lives on the control for screen readers.
                  The whole app re-themes live. */}
              <Row label={t('settings:theme')} changed={themeChanged}>
                <ThemeToggle
                  value={themeDraft}
                  label={t('settings:themeToggle')}
                  onChange={handleTheme}
                />
              </Row>

              {/* Font size: label on the left, the iOS-style slider (flanked by
                  small/large "А") on the right. The slider cluster has a FIXED
                  width (matching the other control rows) so its length stays
                  constant regardless of the translated label's length; the label
                  takes the remaining space and may shrink/wrap on narrow screens.
                  The whole app scales live, so the dialog previews the chosen size. */}
              <div
                className={`flex items-center gap-4 px-4 py-3 transition-colors ${
                  fontChanged ? 'bg-accent-bg' : ''
                }`}
              >
                <span className="min-w-0 flex-1 text-sm font-medium text-heading">
                  {t('settings:fontSize')}
                </span>
                <div className="flex w-36 shrink-0 items-center gap-3">
                  <span aria-hidden="true" className="shrink-0 text-sm text-text">
                    А
                  </span>
                  <div className="relative flex-1">
                    {/* Step notches, iOS-style. Inset by the thumb radius (px-3) so
                        the ticks line up with the thumb's centre at each snap point;
                        taller than the track so their ends show past it. The thumb
                        (z-10) sits over the current notch. */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-3 top-1/2 flex h-3 -translate-y-1/2 items-center justify-between"
                    >
                      {Array.from({ length: SCALE_STEPS }).map((_, i) => (
                        <span key={i} className="h-3 w-0.5 rounded-full bg-border" />
                      ))}
                    </div>
                    <input
                      type="range"
                      min={FONT_SCALE_MIN}
                      max={FONT_SCALE_MAX}
                      step={FONT_SCALE_STEP}
                      value={fontDraft}
                      onChange={handleSlider}
                      aria-label={t('settings:fontSize')}
                      // Screen readers announce a human-readable label (e.g.
                      // "увеличен") instead of the raw scale number (0.875, 1.25).
                      aria-valuetext={t(`settings:fontScale.${fontScaleLabelKey(fontDraft)}` as const)}
                      className={sliderClass}
                    />
                  </div>
                  <span aria-hidden="true" className="shrink-0 text-2xl text-text">
                    А
                  </span>
                </div>
              </div>

              {/* Language: a Select on the right. Changing it re-renders the whole
                  app live (preview); persisted on Save like theme/font. */}
              <Row label={t('settings:language')} changed={languageChanged}>
                <div className="w-36 shrink-0">
                  <Select
                    aria-label={t('settings:languageAria')}
                    value={languageDraft}
                    onChange={(e) => handleLanguage(e.target.value as Language)}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {t(`settings:lang.${l}` as const)}
                      </option>
                    ))}
                  </Select>
                </div>
              </Row>
            </Group>
          )}

          {tab === 'orders' && (
            <Group>
              <Row label={t('settings:deliveryMethod')} changed={deliveryChanged}>
                {/* Fixed-width wrapper: Select's own ROOT is `w-full`, so a width on
                    the Select itself is ignored — the box around it sets the size.
                    The pickers share `w-36` so they line up, wide enough that the
                    longest option ("Самовывоз") isn't clipped. */}
                <div className="w-36 shrink-0">
                  <Select
                    aria-label={t('settings:deliveryMethodAria')}
                    value={deliveryDraft}
                    onChange={(e) => setDeliveryDraft(e.target.value as DeliveryMethod)}
                  >
                    {deliveryMethodOptions(tOrder).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </Row>
              <Row label={t('settings:paymentMethod')} changed={paymentChanged}>
                <div className="w-36 shrink-0">
                  <Select
                    aria-label={t('settings:paymentMethodAria')}
                    value={paymentDraft}
                    onChange={(e) => setPaymentDraft(e.target.value as PaymentMethod)}
                  >
                    {paymentMethodOptions(tOrder).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </Row>
              {/* Currency a NEW order starts in. Each option shows the localized
                  name plus its symbol, e.g. "Рубли (₽)". */}
              <Row label={t('settings:currency')} changed={currencyChanged}>
                <div className="w-36 shrink-0">
                  <Select
                    aria-label={t('settings:currencyAria')}
                    value={currencyDraft}
                    onChange={(e) => setCurrencyDraft(e.target.value as Currency)}
                  >
                    {currencyOptions(tOrder).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </Row>
            </Group>
          )}

          {tab === 'account' && (
            <div className="flex flex-col gap-4">
              {user && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-heading">
                    {user.displayName ?? user.email}
                  </span>
                  {user.displayName && user.email && (
                    <span className="text-xs text-text">{user.email}</span>
                  )}
                </div>
              )}
              <Button
                variant="danger"
                onClick={handleLogout}
                // Save lives in the global footer (visible on every tab); disable
                // sign-out while it's in flight so a tab-switch + click can't fire
                // signOutUser() over a pending saveSettings (Cancel is likewise
                // disabled). Consistent with the #99 follow-up.
                disabled={saving}
                className="gap-1.5 self-start"
              >
                <LogoutIcon />
                {t('common:signOut')}
              </Button>
            </div>
          )}

          {tab === 'admin' && adminUser && <AdminSeedSection ownerId={user.uid} />}
        </div>

        {error && (
          <p role="alert" className="m-0 text-danger">
            {error}
          </p>
        )}

        {/* Global actions — save persists every tab's drafts; cancel discards
            them outright (the explicit discard affordance, so no extra confirm).
            Extra top margin sets the actions a touch further from the content. */}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="primary" onClick={handleSave} isLoading={saving}>
            {t('common:save')}
          </Button>
          <Button variant="secondary" onClick={reallyClose} disabled={saving}>
            {t('common:cancel')}
          </Button>
        </div>
      </div>

      {/* Discard guard: a confirm card over the (now inert) settings body, shown
          when dismissing with unsaved changes. "Keep editing" is first so it's the
          focused, safe default; "Discard" closes without saving. */}
      {confirmingDiscard && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-black/40 p-4">
          <div
            ref={confirmRef}
            // A nested alertdialog so AT announces the discard prompt's own title
            // and body when focus enters it — the outer Modal's aria-labelledby
            // still points at "Настройки", which would otherwise be re-read.
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            aria-describedby="discard-body"
            className="flex w-full max-w-xs flex-col gap-4 rounded-lg border border-border bg-bg p-5 shadow-xl"
          >
            <div className="flex flex-col gap-1">
              <h3 id="discard-title" className="m-0 text-base font-semibold text-heading">
                {t('settings:discardTitle')}
              </h3>
              <p id="discard-body" className="m-0 text-sm text-text">
                {t('settings:discardBody')}
              </p>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <Button variant="secondary" onClick={() => setConfirmingDiscard(false)}>
                {t('settings:keepEditing')}
              </Button>
              <Button variant="danger" onClick={reallyClose}>
                {t('settings:discard')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default SettingsModal
