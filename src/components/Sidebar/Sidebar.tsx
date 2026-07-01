import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Button from '../Button/Button'
import SettingsModal from '../SettingsModal/SettingsModal'
import SyncStatus from '../SyncStatus/SyncStatus'

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
// button returns UP from. Derived from NAV_LINKS so a new nav destination is
// automatically treated as top-level.
const TOP_LEVEL_PATHS = NAV_LINKS.map((link) => link.to)

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

// Settings row, styled like a nav destination (it now lives IN the button list,
// not as a special right-corner gear). Opens the settings dialog.
const settingsRowClass =
  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-heading transition-colors ' +
  'hover:bg-primary-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

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
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  // Inner pages (order/customer detail, the create/edit form) get a mobile "up"
  // control; the top-level nav destinations are the top screen, so they don't.
  const showBack = !TOP_LEVEL_PATHS.includes(location.pathname)

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

  const settingsButton = (onBefore?: () => void) => (
    <button
      type="button"
      onClick={() => {
        onBefore?.()
        setSettingsOpen(true)
      }}
      className={settingsRowClass}
    >
      <GearIcon />
      {t('settings')}
    </button>
  )

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

        {/* Per-page controls (search / filter), when a page publishes them.
            Stacked as a column (not a row) so each control gets the full rail
            width and can't overflow it — an expanded search would otherwise be
            wider than the 208px inner rail. This also lines them up in the same
            vertical rhythm as the nav rows above. */}
        {actions && <div className="flex flex-col items-stretch gap-2">{actions}</div>}

        {/* Pinned to the bottom: the sync indicator (only shows when offline or
            flushing) and the settings control, now part of the button list. */}
        <div className="mt-auto flex flex-col gap-1">
          <SyncStatus />
          {settingsButton()}
        </div>
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

        <div className="mt-auto flex flex-col gap-1">{settingsButton(closeMenu)}</div>
      </nav>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

export default Sidebar
