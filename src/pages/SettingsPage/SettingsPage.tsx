import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/authContext'
import { useSettings } from '@/context/settingsContext'
import type { SettingsDraft } from '@/context/settingsContext'
import { signOutUser } from '@/firebase/auth'
import { clearOrderDraft } from '@/components/OrderForm/draft'
import { LANGUAGES } from '@/types/settings'
import type { ThemeMode } from '@/types/settings'
import { currencyOptions, deliveryMethodOptions, paymentMethodOptions } from '@/lib/orderLabels'
import { CURRENCIES, DELIVERY_METHOD_VALUES, PAYMENT_METHOD_VALUES } from '@/types/order'
import { asEnum } from '@/utils/asEnum'
import Button from '@/components/Button/Button'
import Select from '@/components/Select/Select'
import SelectOptions from '@/components/SelectOptions/SelectOptions'
import AdminSeedSection from '@/components/Settings/AdminSeedSection'
import AdminWipeSection from '@/components/Settings/AdminWipeSection'
import { settingsSectionsFor, isSettingsSection } from '@/components/Settings/sections'
import Group from '@/components/Settings/Group'
import Row from '@/components/Settings/Row'
import ThemeToggle from '@/components/Settings/ThemeToggle'
import FontSizeSlider from '@/components/Settings/FontSizeSlider'
import LogoutIcon from '@/components/icons/LogoutIcon'
import { isAdmin } from '@/lib/admin'
import { SCREEN_PADDING } from '@/styles/screenStyles'

// Settings screen — just the CONTENT of the active section (the section nav
// lives in the sidebar; the active section travels in the URL as `?section=`).
// Holds the colour theme, per-user font size, language, the new-order defaults,
// the account (name + sign-out) and the admin seeder.
//
// AUTOSAVE (owner decision): every change persists IMMEDIATELY — there are no
// Save/Cancel buttons, no drafts, and therefore no unsaved state to guard with
// a leave-blocker/beforeunload/preview-revert (all of which this page used to
// carry). `commit` hands saveSettings the current values with the one changed
// field swapped in; the provider applies them in place and persists in the
// background (offline-safe fire-and-forget — see SettingsProvider).
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
    saveSettings,
  } = useSettings()

  // The slider's thumb position during a pointer drag. The slider holds the
  // live font commit while the thumb is held down (so the rescaling page doesn't
  // slide the thumb out from under the pointer) — this local state is what moves
  // the thumb in the meantime; the drag's release (onPreview) commits + saves.
  const [fontDraft, setFontDraft] = useState(fontScale)
  // Re-sync the thumb whenever the SAVED scale changes from outside a drag —
  // above all when the user's settings resolve from Firestore after this page
  // already mounted (fontDraft seeded from the default would otherwise leave the
  // thumb stranded at 1). Adjust-state-during-render (the pattern React
  // recommends over an effect), keyed on the saved value: during a drag
  // fontScale doesn't move, so the held thumb is never yanked.
  const [syncedScale, setSyncedScale] = useState(fontScale)
  if (fontScale !== syncedScale) {
    setSyncedScale(fontScale)
    setFontDraft(fontScale)
  }

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

  // Persist one changed field: the current values with the change swapped in.
  // Synchronous — the provider commits the values as applied at once and writes
  // to Firebase in the background, so a control never waits on the network.
  const commit = (patch: Partial<SettingsDraft>) =>
    saveSettings({
      fontScale,
      theme,
      language,
      defaultDeliveryMethod,
      defaultPaymentMethod,
      defaultCurrency,
      ...patch,
    })

  const handleTheme = (next: ThemeMode) => commit({ theme: next })

  const handleLogout = async () => {
    // signOut is a local operation (clears the persisted session, no network
    // request), so it works offline and almost never fails. But if it does, the
    // user must SEE it — otherwise they think they signed out while the session
    // is still live. Await it, surface any failure inline (a successful sign-out
    // navigates away via the auth change anyway).
    setError(null)
    try {
      // Drop the order-form draft BEFORE signing out: it holds typed customer
      // PII (name/phone/address) in plaintext localStorage and would otherwise
      // linger on the device indefinitely after logout. Cleared first (while
      // the uid is still known); a failed sign-out leaves the session live, and
      // losing a draft in that edge is an acceptable trade for never leaking one.
      if (user) clearOrderDraft(user.uid)
      await signOutUser()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings:signOutError'))
    }
  }

  // The appearance/orders sections hold editable settings, so they stretch to
  // the full content width; account/admin are just actions (sign-out / seed) and
  // stay at a comfortable reading width.
  const wide = section === 'appearance' || section === 'orders'

  return (
    // Content-only settings screen — the section nav lives in the sidebar now.
    // One scrolling column; with autosave there is no footer, so the content
    // simply flows from the top.
    <div className={`min-h-0 flex-1 overflow-auto ${SCREEN_PADDING}`}>
      <div className={`flex flex-col gap-6 ${wide ? '' : 'max-w-2xl'}`}>
        {/* Visually-hidden page heading: the screen shows no visible title (the
            section nav lives in the sidebar), so a screen reader landing here via a
            direct link (/settings?section=…) still hears the page name. */}
        <h1 className="sr-only">{t('settings:title')}</h1>

        <div
          role="region"
          // Named by the section's own label so the region announces which
          // settings it holds.
          aria-label={t(`settings:tabs.${section}` as const)}
          className="flex flex-col gap-2"
        >
          {section === 'appearance' && (
            <Group>
              {/* Theme: a sun/moon switch on the right. The whole app re-themes
                  and the choice persists immediately. */}
              <Row label={t('settings:theme')}>
                <ThemeToggle value={theme} label={t('settings:themeToggle')} onChange={handleTheme} />
              </Row>

              {/* Font size: an iOS-style notched slider. Keyboard steps commit
                  (apply + save) one notch at a time; a pointer drag moves only
                  the local thumb (fontDraft) and commits ONCE on release, so a
                  drag is a single save, not one per notch. */}
              <FontSizeSlider
                value={fontDraft}
                onDraftChange={setFontDraft}
                onPreview={(next) => commit({ fontScale: next })}
              />

              {/* Language: a Select on the right. Changing it re-renders the
                  whole app in the new language and persists at once. */}
              <Row label={t('settings:language')}>
                <div className="w-36 shrink-0">
                  <Select
                    aria-label={t('settings:languageAria')}
                    value={language}
                    onChange={(e) => commit({ language: asEnum(LANGUAGES, e.target.value, language) })}
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
                    value={defaultDeliveryMethod}
                    onChange={(e) =>
                      commit({
                        defaultDeliveryMethod: asEnum(
                          DELIVERY_METHOD_VALUES,
                          e.target.value,
                          defaultDeliveryMethod,
                        ),
                      })
                    }
                  >
                    <SelectOptions options={deliveryMethodOptions(tOrder)} />
                  </Select>
                </div>
              </Row>
              <Row label={t('settings:paymentMethod')}>
                <div className="w-36 shrink-0">
                  <Select
                    aria-label={t('settings:paymentMethodAria')}
                    value={defaultPaymentMethod}
                    onChange={(e) =>
                      commit({
                        defaultPaymentMethod: asEnum(
                          PAYMENT_METHOD_VALUES,
                          e.target.value,
                          defaultPaymentMethod,
                        ),
                      })
                    }
                  >
                    <SelectOptions options={paymentMethodOptions(tOrder)} />
                  </Select>
                </div>
              </Row>
              {/* Currency a NEW order starts in. Each option shows the localized
                  name plus its symbol, e.g. "Рубли (₽)". */}
              <Row label={t('settings:currency')}>
                <div className="w-36 shrink-0">
                  <Select
                    aria-label={t('settings:currencyAria')}
                    value={defaultCurrency}
                    onChange={(e) =>
                      commit({
                        defaultCurrency: asEnum(CURRENCIES, e.target.value, defaultCurrency),
                      })
                    }
                  >
                    <SelectOptions options={currencyOptions(tOrder)} />
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
              <Button variant="danger" onClick={handleLogout} className="gap-1.5 self-start">
                <LogoutIcon />
                {t('common:signOut')}
              </Button>
            </div>
          )}

          {section === 'admin' && adminUser && (
            <>
              <AdminSeedSection ownerId={user.uid} />
              {/* Clean-slate wipe, below the seeder: deletes ALL of the admin's
                  own orders/customers (see AdminWipeSection). */}
              <AdminWipeSection ownerId={user.uid} />
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="m-0 text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

export default SettingsPage
