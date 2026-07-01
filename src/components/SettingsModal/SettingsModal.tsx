import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/authContext'
import { useSettings } from '../../context/settingsContext'
import { signOutUser } from '../../firebase/auth'
import { LANGUAGES } from '../../types/settings'
import type { Language, ThemeMode } from '../../types/settings'
import { currencyOptions, deliveryMethodOptions, paymentMethodOptions } from '../../types/order'
import type { Currency, DeliveryMethod, PaymentMethod } from '../../types/order'
import Button from '../Button/Button'
import Select from '../Select/Select'
import Modal from '../Modal/Modal'
import AdminSeedSection from './AdminSeedSection'
import SettingsTabs from './SettingsTabs'
import type { SettingsTab } from './SettingsTabs'
import { Group, Row, ThemeToggle, FontSizeSlider, LogoutIcon } from './controls'
import { isAdmin } from '../../lib/admin'

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

  // Any draft differing from its saved value means there are unsaved changes —
  // drives the discard guard when the user dismisses the dialog.
  const isDirty =
    fontDraft !== fontScale ||
    themeDraft !== theme ||
    languageDraft !== language ||
    deliveryDraft !== defaultDeliveryMethod ||
    paymentDraft !== defaultPaymentMethod ||
    currencyDraft !== defaultCurrency

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
    // admin tab) fits each label on one line without truncating "Внешний вид".
    <Modal title={t('settings:title')} onClose={requestClose} widthClassName="max-w-lg">
      {/* The settings body is made inert while the discard confirmation is up, so
          only the confirm card is interactive (and it visually dims behind it). */}
      <div inert={confirmingDiscard} className="flex flex-col gap-6">
        <SettingsTabs tabs={tabs} value={tab} onChange={setTab} />

        {/* A fixed min-height sized to the tallest everyday tab (appearance /
            orders, three rows each) so the dialog doesn't jump as the user switches
            tabs — a shorter tab (account) just pads to the same height. BUMP THIS
            whenever a tab gains rows and grows past it: the value must stay ≥ the
            tallest everyday tab, otherwise that tab nudges the dialog height again. */}
        <div
          role="tabpanel"
          id={`settings-panel-${tab}`}
          // Named by the section's own label (not aria-labelledby → the tab) so the
          // name holds on phones too, where the desktop tablist is display:none.
          aria-label={t(`settings:tabs.${tab}` as const)}
          className="flex min-h-[14rem] flex-col gap-2"
        >
          {tab === 'appearance' && (
            <Group>
              {/* Theme: a sun/moon switch on the right. The icons are
                  self-explanatory, so the row's text label carries the name; the
                  switch's accessible name lives on the control for screen readers.
                  The whole app re-themes live. */}
              <Row label={t('settings:theme')}>
                <ThemeToggle
                  value={themeDraft}
                  label={t('settings:themeToggle')}
                  onChange={handleTheme}
                />
              </Row>

              {/* Font size: an iOS-style notched slider. The whole app scales
                  live (preview), so the dialog reflects the chosen size; the
                  control owns its drag handling — see FontSizeSlider. */}
              <FontSizeSlider
                value={fontDraft}
                onDraftChange={setFontDraft}
                onPreview={previewFontScale}
              />

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
              <Row label={t('settings:deliveryMethod')}>
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
              <Row label={t('settings:paymentMethod')}>
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
              <Row label={t('settings:currency')}>
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
        <div className="mt-2 flex flex-col gap-2 min-[769px]:flex-row min-[769px]:justify-end">
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
