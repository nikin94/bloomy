import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/authContext'
import { useSettings } from '../../context/settingsContext'
import { signOutUser } from '../../firebase/auth'
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP, LANGUAGES } from '../../types/settings'
import type { Language, ThemeMode } from '../../types/settings'
import { DELIVERY_METHOD_OPTIONS, PAYMENT_METHOD_OPTIONS } from '../../types/order'
import type { DeliveryMethod, PaymentMethod } from '../../types/order'
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

// iOS-style grouped list: a small uppercase caption above a rounded card whose
// rows are separated by hairline dividers. Keeps each setting a "label left,
// control right" row so the dialog reads as a settings list, not a loose stack.
const SectionLabel = ({ children }: { children: ReactNode }) => (
  <h3 className="m-0 px-1 text-xs font-medium uppercase tracking-wide text-text">{children}</h3>
)

// A rounded card grouping its rows; adjacent rows get a top hairline divider.
const Group = ({ children }: { children: ReactNode }) => (
  <div className="overflow-hidden rounded-lg border border-border [&>*+*]:border-t [&>*+*]:border-border">
    {children}
  </div>
)

// One settings row: label on the left, control on the right. The label stays on
// one line (shrink-0 + nowrap) so a wide control can't squeeze it into a wrap.
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3">
    <span className="shrink-0 whitespace-nowrap text-sm font-medium text-heading">{label}</span>
    {children}
  </div>
)

// Mounts the dialog only while open, so each opening starts from the persisted
// values (drafts are seeded from the applied settings on mount) without a reset
// effect.
const SettingsModal = ({ open, onClose }: { open: boolean; onClose: () => void }) =>
  open ? <SettingsDialog onClose={onClose} /> : null

// Settings dialog body. Holds the colour theme (a sun/moon switch) and the
// per-user font size (an iOS-style size slider), plus sign-out; the shared Modal
// owns the shell (dialog role, backdrop, Escape, focus trap, header). Both
// controls update the whole app immediately for preview, but are only persisted
// to Firebase on "Сохранить"; dismissing reverts the live preview to the saved
// values.
const SettingsDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation(['settings', 'common'])
  const { user } = useAuth()
  const {
    fontScale,
    theme,
    language,
    defaultDeliveryMethod,
    defaultPaymentMethod,
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dismissing (backdrop / Escape / close button / "Отмена") drops the live
  // preview back to the persisted values, then closes.
  const handleClose = () => {
    previewFontScale(fontScale)
    previewTheme(theme)
    previewLanguage(language)
    onClose()
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
    <Modal title={t('settings:title')} onClose={handleClose}>
      {/* Appearance: theme + font size + language, as an iOS-style grouped list. */}
      <section className="flex flex-col gap-2">
        <SectionLabel>{t('settings:appearance')}</SectionLabel>
        <Group>
          {/* Theme: a sun/moon switch on the right. The icons are
              self-explanatory, so the row's text label carries the name; the
              switch's accessible name lives on the control for screen readers.
              The whole app re-themes live. */}
          <Row label={t('settings:theme')}>
            <ThemeToggle value={themeDraft} label={t('settings:themeToggle')} onChange={handleTheme} />
          </Row>

          {/* Font size: label on the left, the iOS-style slider (flanked by
              small/large "А") taking the rest of the row after a fixed gap. The
              whole app scales live, so the dialog previews the chosen size. */}
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="shrink-0 whitespace-nowrap text-sm font-medium text-heading">
              {t('settings:fontSize')}
            </span>
            <div className="flex flex-1 items-center gap-3">
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
          <Row label={t('settings:language')}>
            <div className="w-36 shrink-0">
              <Select
                aria-label={t('settings:languageAria')}
                value={languageDraft}
                onChange={(e) => handleLanguage(e.target.value as Language)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {t(`settings:lang.${l}`)}
                  </option>
                ))}
              </Select>
            </div>
          </Row>
        </Group>
      </section>

      {/* New-order defaults: prefill the order form's delivery/payment method.
          These don't change the live app, only the next new order. */}
      <section className="flex flex-col gap-2">
        <SectionLabel>{t('settings:orderDefaults')}</SectionLabel>
        <Group>
          <Row label={t('settings:deliveryMethod')}>
            {/* Fixed-width wrapper: Select's own ROOT is `w-full`, so a width on
                the Select itself is ignored — the box around it sets the size.
                Both pickers share `w-36` so they're identical and line up, wide
                enough that the longest option ("Самовывоз") isn't clipped. */}
            <div className="w-36 shrink-0">
              <Select
                aria-label={t('settings:deliveryMethodAria')}
                value={deliveryDraft}
                onChange={(e) => setDeliveryDraft(e.target.value as DeliveryMethod)}
              >
                {DELIVERY_METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </Row>
          <Row label={t('settings:paymentMethod')}>
            <div className="w-36 shrink-0">
              <Select
                aria-label={t('settings:paymentMethodAria')}
                value={paymentDraft}
                onChange={(e) => setPaymentDraft(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </Row>
        </Group>
      </section>

      {error && (
        <p role="alert" className="m-0 text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="primary" onClick={handleSave} isLoading={saving}>
          {t('common:save')}
        </Button>
        <Button variant="secondary" onClick={handleClose} disabled={saving}>
          {t('common:cancel')}
        </Button>
      </div>

      <span aria-hidden="true" className="h-px w-full bg-border" />

      {/* Account row: the signed-in user's name (moved out of the header) next
          to sign-out. */}
      <div className="flex items-center justify-between gap-3">
        {user && (
          <span className="min-w-0 truncate text-sm text-text">
            {user.displayName ?? user.email}
          </span>
        )}
        <Button variant="secondary" onClick={handleLogout} className="shrink-0 gap-1.5">
          <LogoutIcon />
          {t('common:signOut')}
        </Button>
      </div>

      {/* Admin-only test-data seeder (heavy fixtures lazy-loaded on use). */}
      {isAdmin(user?.uid) && user && <AdminSeedSection ownerId={user.uid} />}
    </Modal>
  )
}

export default SettingsModal
