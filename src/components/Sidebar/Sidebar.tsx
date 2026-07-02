import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Button from '../Button/Button'
import SyncStatus from '../SyncStatus/SyncStatus'
import { useAuth } from '../../context/authContext'
import { isAdmin } from '../../lib/admin'
import { settingsSectionsFor, isSettingsSection } from '../Settings/sections'

// Navigation destinations, defined once so a new section is added in ONE place
// and appears in both the desktop rail and the mobile drawer. `end` keeps
// "Заказы" active only on the exact list route, not on /orders/new. The label is
// a key into the `nav` namespace, resolved per-render so it follows the language.
const NAV_LINKS: { to: string; labelKey: 'orders' | 'customers' | 'stats' | 'trash'; end?: boolean }[] = [
  { to: '/orders', labelKey: 'orders', end: true },
  { to: '/customers', labelKey: 'customers' },
  { to: '/stats', labelKey: 'stats' },
  { to: '/orders/deleted', labelKey: 'trash' },
]

// The top-level destinations reachable straight from the nav — these ARE the
// "top screen", so they get no back control. Every OTHER signed-in route is an
// inner page (an order/customer detail, the create/edit form) that a mobile back
// button returns UP from. Derived from NAV_LINKS plus /settings (also a sidebar
// destination, just rendered in the bottom cluster rather than the nav list).
const TOP_LEVEL_PATHS = [...NAV_LINKS.map((link) => link.to), '/settings']

// The parent ("upper") screen of an inner page: the path with its last segment
// dropped — `/orders/:id/edit` → `/orders/:id`, `/orders/:id` → `/orders`,
// `/customers/:id` → `/customers`, `/orders/new` → `/orders`. Deterministic (it
// walks the route hierarchy, not the history stack), so "back" always lands on
// the section above regardless of how the page was reached.
const parentPath = (pathname: string): string => {
  const trimmed = pathname.replace(/\/+$/, '')
  const cut = trimmed.lastIndexOf('/')
  return cut > 0 ? trimmed.slice(0, cut) : '/orders'
}

const BackIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-6"
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

const PlusIcon = ({ className = 'size-4' }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const GearIcon = () => (
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
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const BurgerIcon = ({ open }: { open: boolean }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-6"
  >
    {open ? (
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>
    ) : (
      <>
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </>
    )}
  </svg>
)

// A nav destination in the vertical rail/drawer: a full-width row, filled when its
// route is active. Same treatment in both the desktop rail and the mobile drawer
// so they never drift.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    isActive ? 'bg-primary text-white' : 'text-heading hover:bg-primary-bg',
  ].join(' ')

// The "Новый заказ" ACTION (it creates) gets the primary treatment so it reads as
// the main action, not a fifth nav tab. Still a NavLink (it navigates to the form
// route — links stay the a11y-correct element for navigation), full-width to match
// the vertical rail, styled to mirror the primary Button.
const createLinkClass =
  'flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 py-2 ' +
  'text-sm font-medium text-white no-underline transition-opacity hover:opacity-90 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

const ChevronIcon = ({ className = 'size-4' }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

// The "Настройки" control. It is no longer a link to /settings — it TOGGLES the
// section nav (a flyout on desktop, an accordion in the mobile drawer); navigation
// to /settings happens only when a section is picked. Styled like a nav
// destination (gap for the leading gear icon), filled when the settings screen is
// the active route so it still reads as "you are in settings".
const settingsToggleClass = (active: boolean) =>
  [
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    active ? 'bg-primary text-white' : 'text-heading hover:bg-primary-bg',
  ].join(' ')

// A section row in the settings nav (flyout / drawer accordion). A LIGHTER register
// than the main destinations — muted normal-weight text, the active section
// accent-coloured on a soft bg-primary-bg tint — so the second level reads as
// subordinate to the main nav rather than a peer of it.
const sectionLinkClass = (selected: boolean) =>
  [
    'flex items-center rounded-md px-3 py-2 text-sm no-underline transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    selected ? 'bg-primary-bg font-semibold text-primary' : 'font-normal text-text hover:text-heading',
  ].join(' ')

// App-wide navigation, as a LEFT sidebar (replaces the former top header). On wide
// screens (md+) it is a fixed vertical rail beside the content, giving the
// full-screen table more vertical room and ordering the growing control list as a
// column. Below md it collapses to a thin top bar with a burger that reveals an
// off-canvas drawer sliding in from the left — the drawer overlays the content
// (fixed, out of flow) so opening it never nudges the page. Both layouts share
// NAV_LINKS. The settings control (which holds the user name + sign-out) now sits
// in the same button list instead of a corner gear.
//
// `actions` is the per-page controls slot (e.g. the orders search + filter),
// published by the page via useHeaderActions and rendered here so the sidebar
// stays unaware of what a page contributes.
const Sidebar = ({ actions }: { actions?: ReactNode }) => {
  const { t } = useTranslation('nav')
  // Section labels live in the `settings` namespace (shared with the page).
  const { t: tSettings } = useTranslation('settings')
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  // Inner pages (order/customer detail, the create/edit form) get a mobile "up"
  // control; the top-level nav destinations are the top screen, so they don't.
  const showBack = !TOP_LEVEL_PATHS.includes(location.pathname)

  // The settings sections + the active one (from the URL `?section=`). The nav here
  // and the settings page read the same param, so the highlight always matches the
  // shown panel. Admin section only for an admin.
  const onSettings = location.pathname === '/settings'
  const sections = settingsSectionsFor(isAdmin(user?.uid) && user !== null)
  const requestedSection = searchParams.get('section')
  const currentSection = isSettingsSection(requestedSection) ? requestedSection : 'appearance'

  // The desktop settings flyout: a second-level panel that slides out horizontally
  // from under the main rail when "Настройки" is toggled. It STARTS open when you
  // enter the settings route (so the section list is there on arrival) and closes
  // when you leave; the toggle flips it in between — including closing it in place
  // while still on /settings, or peeking the sections from another page.
  // Navigation happens only when a section is picked.
  const [flyoutOpen, setFlyoutOpen] = useState(onSettings)
  // Sync the flyout to the route by adjusting state during render (the pattern
  // React recommends over an effect): entering /settings forces it open, leaving
  // forces it closed; the toggle flips it while the route is unchanged.
  const [wasOnSettings, setWasOnSettings] = useState(onSettings)
  if (onSettings !== wasOnSettings) {
    setWasOnSettings(onSettings)
    setFlyoutOpen(onSettings)
  }
  // The mobile drawer's settings accordion — independent of the desktop flyout.
  const [settingsExpanded, setSettingsExpanded] = useState(onSettings)

  // Close the mobile drawer on Escape, so keyboard users aren't trapped with the
  // overlay open. Only listens while the drawer is open.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  // The nav destinations, shared by the rail and the drawer. `onNavigate` closes
  // the drawer after a pick (a no-op on the desktop rail).
  const destinations = (onNavigate?: () => void) =>
    NAV_LINKS.map((link) => (
      <NavLink key={link.to} to={link.to} end={link.end} className={navLinkClass} onClick={onNavigate}>
        {t(link.labelKey)}
      </NavLink>
    ))

  // The settings section links (flyout / drawer accordion). Each navigates to
  // /settings?section=<key> — the only way onto the settings screen. `onNavigate`
  // closes the drawer after a pick (a no-op in the desktop flyout).
  const sectionLinks = (onNavigate?: () => void) =>
    sections.map((key) => {
      const selected = onSettings && currentSection === key
      return (
        <Link
          key={key}
          to={`/settings?section=${key}`}
          onClick={onNavigate}
          aria-current={selected ? 'page' : undefined}
          className={sectionLinkClass(selected)}
        >
          {tSettings(`tabs.${key}` as const)}
        </Link>
      )
    })

  return (
    <>
      {/* Desktop rail (md and up): a vertical column beside the content. */}
      <nav
        data-testid="sidebar-desktop"
        aria-label={t('menu')}
        className="hidden w-60 shrink-0 flex-col gap-2 border-r border-border p-4 md:flex"
      >
        <NavLink to="/orders/new" className={createLinkClass}>
          <PlusIcon />
          {t('newOrder')}
        </NavLink>

        <span aria-hidden="true" className="my-1 h-px w-full bg-border" />

        <div className="flex flex-col gap-1">{destinations()}</div>

        {/* Bottom cluster, pinned via mt-auto and split off by a top divider: the
            page's per-page controls (search / filter), the sync indicator (only
            shows when offline or flushing), and the settings control. The controls
            render here as the same borderless icon+label rows as settings, so the
            whole cluster reads as one consistent list. Each is stacked in its own
            row (items-stretch → full rail width) so an expanded search fills the
            rail and can't overflow its 208px inner width. */}
        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-2">
          {actions && <div className="flex flex-col items-stretch gap-1">{actions}</div>}
          <SyncStatus />
          <button
            type="button"
            onClick={() => setFlyoutOpen((open) => !open)}
            aria-expanded={flyoutOpen}
            aria-controls="settings-flyout"
            className={settingsToggleClass(onSettings)}
          >
            <GearIcon />
            {t('settings')}
          </button>
        </div>
      </nav>

      {/* Desktop settings flyout (md and up): a second-level section nav that slides
          out horizontally from under the main rail. Animates its width (0 ↔ w-52)
          so it appears to emerge from behind the rail; the inner column keeps a
          fixed width so its rows don't reflow mid-animation. `inert` when closed
          drops its links from the tab order. A section pick navigates to
          /settings?section=… (the only route onto the settings screen). */}
      <nav
        id="settings-flyout"
        data-testid="settings-flyout"
        aria-label={tSettings('tabsAria')}
        inert={!flyoutOpen}
        className={`hidden shrink-0 overflow-hidden bg-surface transition-[width] duration-200 ease-out motion-reduce:transition-none md:block ${
          flyoutOpen ? 'w-52 border-r border-border' : 'w-0'
        }`}
      >
        <div className="flex w-52 flex-col gap-1 p-4">{sectionLinks()}</div>
      </nav>

      {/* Mobile top bar (below md): burger opens the left drawer; back + page
          actions sit beside it, the sync indicator on the right. */}
      <div className="flex items-center gap-2 border-b border-border bg-bg px-4 py-3 md:hidden">
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
          aria-expanded={menuOpen}
          aria-controls="mobile-drawer"
          className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border"
        >
          <BurgerIcon open={menuOpen} />
        </Button>
        {showBack && (
          <Button
            variant="secondary"
            size="icon"
            onClick={() => navigate(parentPath(location.pathname))}
            aria-label={t('back')}
            title={t('back')}
            className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border"
          >
            <BackIcon />
          </Button>
        )}
        {/* Page controls take the remaining room and may shrink (`min-w-0`), so an
            expanded search caps to the free space instead of pushing the sync
            indicator off a 320px viewport. */}
        {actions && <div className="flex min-w-0 flex-1 items-center gap-2">{actions}</div>}
        <div className="ml-auto flex items-center gap-2">
          <SyncStatus />
        </div>
      </div>

      {/* Backdrop: catches outside taps to close. Below the drawer, above content.
          Only present while open so it never blocks the page otherwise. */}
      {menuOpen && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={closeMenu}
          className="fixed inset-0 z-40 cursor-default bg-black/30 md:hidden"
        />
      )}

      {/* Mobile drawer: an off-canvas panel sliding in from the left over the
          content. `fixed` (out of flow) so opening it overlays rather than pushing
          the page. `inert` when closed removes its rows from the tab order and the
          a11y tree. `md:hidden` so it never shows on the desktop layout. */}
      <nav
        id="mobile-drawer"
        data-testid="mobile-drawer"
        aria-label={t('menu')}
        inert={!menuOpen}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[80%] flex-col gap-2 border-r border-border bg-bg p-4 shadow-lg transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <NavLink to="/orders/new" className={createLinkClass} onClick={closeMenu}>
          <PlusIcon />
          {t('addOrder')}
        </NavLink>

        <span aria-hidden="true" className="my-1 h-px w-full bg-border" />

        <div className="flex flex-col gap-1">{destinations(closeMenu)}</div>

        {/* Settings: a toggle that expands the section list inline (accordion) —
            no room for a horizontal flyout on a phone. Picking a section navigates
            to /settings and closes the drawer. */}
        <div className="mt-auto flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setSettingsExpanded((open) => !open)}
            aria-expanded={settingsExpanded}
            aria-controls="drawer-settings-sections"
            className={settingsToggleClass(onSettings)}
          >
            <GearIcon />
            {t('settings')}
            <ChevronIcon
              className={`ml-auto size-4 transition-transform ${settingsExpanded ? 'rotate-180' : ''}`}
            />
          </button>
          <div
            id="drawer-settings-sections"
            className={settingsExpanded ? 'flex flex-col gap-1 pl-4' : 'hidden'}
          >
            {sectionLinks(closeMenu)}
          </div>
        </div>
      </nav>
    </>
  )
}

export default Sidebar
