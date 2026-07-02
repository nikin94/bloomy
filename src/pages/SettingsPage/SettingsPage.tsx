import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/authContext'
import { useSettings } from '../../context/settingsContext'
import { signOutUser } from '../../firebase/auth'
import { LANGUAGES } from '../../types/settings'
import type { Language, ThemeMode } from '../../types/settings'
import { currencyOptions, deliveryMethodOptions, paymentMethodOptions } from '../../types/order'
import type { Currency, DeliveryMethod, PaymentMethod } from '../../types/order'
import Button from '../../components/Button/Button'
import Select from '../../components/Select/Select'
import AdminSeedSection from '../../components/Settings/AdminSeedSection'
import { settingsSectionsFor, isSettingsSection } from '../../components/Settings/sections'
import { Group, Row, ThemeToggle, FontSizeSlider, LogoutIcon } from '../../components/Settings/controls'
import { isAdmin } from '../../lib/admin'

// Settings screen (was a modal until Stage 2, then a page with its own sub-rail;
// Stage 3 moved the section nav OUT into the sidebar — a desktop flyout / mobile
// drawer accordion — so this page is now just the CONTENT of the active section).
// The active section travels in the URL as `?section=<key>`: the sidebar links to
// it, this page reads it, so there is one source of truth (and it survives a
// refresh / is linkable). Holds the colour theme, per-user font size, language,
// the new-order defaults, the account (name + sign-out) and the admin seeder.
// Theme/font/language update the whole app immediately for preview but are only
// persisted on "Сохранить".
//
// Discard model on a PAGE (vs the old modal): a declarative <BrowserRouter> has no
// navigation blocker, so instead of a dismiss-confirm we (a) revert the live
// preview to the saved values when the page UNMOUNTS, so leaving without saving
// never leaves the app showing an unsaved theme/font/language, and (b) arm the
// browser's native beforeunload prompt while there are unsaved edits, covering a
// tab close / refresh. "Отмена" reverts the edits in place; "Сохранить" persists.
const SettingsPage = () => {
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
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The admin section exists only for an admin account.
  const adminUser = isAdmin(user?.uid) && user !== null
  const sections = settingsSectionsFor(adminUser)

  // The active section comes from the URL (`?section=`). A missing/unknown value —
  // or the admin section for a non-admin — falls back to the first section, so the
  // page always renders a valid panel.
  const [searchParams] = useSearchParams()
  const requested = searchParams.get('section')
  const section =
    isSettingsSection(requested) && sections.includes(requested) ? requested : 'appearance'

  // Any draft differing from its saved value means there are unsaved changes —
  // drives the beforeunload guard and enables Cancel / disables the saved note.
  const isDirty =
    fontDraft !== fontScale ||
    themeDraft !== theme ||
    languageDraft !== language ||
    deliveryDraft !== defaultDeliveryMethod ||
    paymentDraft !== defaultPaymentMethod ||
    currencyDraft !== defaultCurrency

  // Revert the LIVE preview (theme/font/language) back to the saved values when the
  // page unmounts, so navigating away without saving never leaves the app rendered
  // in an unsaved appearance. Reads the latest saved values + preview setters from
  // refs so the empty-dep cleanup (unmount only) always reverts to the current
  // truth (e.g. the just-saved values after a Save), not a stale render's closure.
  const revertRef = useRef({ fontScale, theme, language, previewFontScale, previewTheme, previewLanguage })
  // Keep the ref pointed at the latest saved values + preview setters after every
  // commit, so the unmount-only cleanup below reads the current truth.
  useEffect(() => {
    revertRef.current = { fontScale, theme, language, previewFontScale, previewTheme, previewLanguage }
  })
  useEffect(
    () => () => {
      const r = revertRef.current
      r.previewFontScale(r.fontScale)
      r.previewTheme(r.theme)
      r.previewLanguage(r.language)
    },
    [],
  )

  // Native "leave site?" prompt for a tab close / refresh with unsaved edits — the
  // one navigation an in-app router can't mediate. Armed only while dirty.
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const handleTheme = (next: ThemeMode) => {
    setSaved(false)
    setThemeDraft(next)
    previewTheme(next) // live page update; not persisted until "Сохранить"
  }

  const handleLanguage = (next: Language) => {
    setSaved(false)
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
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings:saveError'))
    } finally {
      setSaving(false)
    }
  }

  // Discard the unsaved edits in place: reset every draft to its saved value and
  // revert the live preview. Stays on the page (there is no dialog to close).
  const handleCancel = () => {
    setFontDraft(fontScale)
    setThemeDraft(theme)
    setLanguageDraft(language)
    setDeliveryDraft(defaultDeliveryMethod)
    setPaymentDraft(defaultPaymentMethod)
    setCurrencyDraft(defaultCurrency)
    previewFontScale(fontScale)
    previewTheme(theme)
    previewLanguage(language)
    setSaved(false)
    setError(null)
  }

  const handleLogout = async () => {
    // signOut is a local operation (clears the persisted session, no network
    // request), so it works offline and almost never fails. But if it does, the
    // user must SEE it — otherwise they think they signed out while the session
    // is still live. Await it, surface any failure inline (a successful sign-out
    // navigates away via the auth change anyway).
    setError(null)
    try {
      await signOutUser()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings:signOutError'))
    }
  }

  // The appearance/orders sections hold editable settings, so they stretch to the
  // full content width and carry the Save/Cancel footer. Account/admin are just
  // actions (sign-out / seed) with nothing to persist, so they stay at a
  // comfortable reading width and show no footer.
  const wide = section === 'appearance' || section === 'orders'

  return (
    // Content-only settings screen — the section nav lives in the sidebar now. A
    // single scrolling column that fills the height (min-h-full): the active
    // section's content sits at the top and the Save/Cancel footer is pushed to the
    // BOTTOM of the column via mt-auto (so on a short section it rests at the bottom
    // of the screen, not glued under the last row); when the content is tall enough
    // to fill, mt-auto collapses and the footer just flows after it. Appearance/orders
    // stretch to the full width; account/admin stay capped to a comfortable width.
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className={`flex min-h-full flex-col gap-6 ${wide ? '' : 'max-w-2xl'}`}>
        <div
          role="region"
          // Named by the section's own label so the region announces which
          // settings it holds.
          aria-label={t(`settings:tabs.${section}` as const)}
          className="flex flex-col gap-2"
        >
          {section === 'appearance' && (
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
                  live (preview); the control owns its drag handling. */}
              <FontSizeSlider
                value={fontDraft}
                onDraftChange={(next) => {
                  setSaved(false)
                  setFontDraft(next)
                }}
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

          {section === 'orders' && (
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
                    onChange={(e) => {
                      setSaved(false)
                      setDeliveryDraft(e.target.value as DeliveryMethod)
                    }}
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
                    onChange={(e) => {
                      setSaved(false)
                      setPaymentDraft(e.target.value as PaymentMethod)
                    }}
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
                    onChange={(e) => {
                      setSaved(false)
                      setCurrencyDraft(e.target.value as Currency)
                    }}
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

          {section === 'account' && (
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
                // Disable sign-out while a save is in flight so a section switch +
                // click can't fire signOutUser() over a pending saveSettings.
                disabled={saving}
                className="gap-1.5 self-start"
              >
                <LogoutIcon />
                {t('common:signOut')}
              </Button>
            </div>
          )}

          {section === 'admin' && adminUser && <AdminSeedSection ownerId={user.uid} />}
        </div>

        {error && (
          <p role="alert" className="m-0 text-danger">
            {error}
          </p>
        )}

        {/* Save persists every section's drafts; Cancel discards the unsaved edits
            in place (reverting the live preview). A brief saved note confirms a
            successful persist, cleared the moment a new edit is made. Shown only for
            the sections that actually have settings to save (appearance / orders);
            account and admin are action-only, so no footer. */}
        {wide && (
          <div className="mt-auto flex flex-col gap-2 min-[769px]:flex-row min-[769px]:items-center min-[769px]:justify-end">
            {saved && (
              <span role="status" className="text-sm text-text min-[769px]:mr-auto">
                {t('settings:saved')}
              </span>
            )}
            <Button variant="secondary" onClick={handleCancel} disabled={saving || !isDirty}>
              {t('common:cancel')}
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={saving} disabled={!isDirty}>
              {t('common:save')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default SettingsPage
