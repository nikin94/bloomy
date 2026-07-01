import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Button from '../Button/Button'
import SettingsModal from '../SettingsModal/SettingsModal'
import SyncStatus from '../SyncStatus/SyncStatus'

// Navigation destinations, defined once so a new section is added in ONE place
// and appears in both the desktop bar and the mobile menu. `end` keeps "Заказы"
// active only on the exact list route, not on /orders/new. The label is a key
// into the `nav` namespace, resolved per-render so it follows the active language.
const NAV_LINKS: { to: string; labelKey: 'orders' | 'customers' | 'stats' | 'trash'; end?: boolean }[] = [
  { to: '/orders', labelKey: 'orders', end: true },
  { to: '/customers', labelKey: 'customers' },
  { to: '/stats', labelKey: 'stats' },
  { to: '/orders/deleted', labelKey: 'trash' },
]

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

// Desktop: nav destinations are outline buttons whose active route is filled.
const navButtonClass = ({ isActive }: { isActive: boolean }) =>
  [
    'inline-flex items-center rounded-md px-4 py-2 text-sm font-medium no-underline transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    isActive ? 'bg-primary text-white' : 'border border-border text-heading hover:bg-primary-bg',
  ].join(' ')

// The "Новый заказ" ACTION (it creates) gets the primary treatment so it reads
// as the main action, not a third nav tab. Still a NavLink (it navigates to the
// form route — links stay the a11y-correct element for navigation), styled to
// mirror the primary Button.
const actionButtonClass =
  'inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium ' +
  'text-white no-underline transition-opacity hover:opacity-90 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

// Mobile menu rows: full-width, same active-route fill as desktop.
const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'block rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    isActive ? 'bg-primary text-white' : 'text-heading hover:bg-primary-bg',
  ].join(' ')

// Full-bleed separator. Spacing around it comes from the adjacent sections'
// equal padding, not its own margin, so the gap above and below stays symmetric.
const MenuDivider = () => <span aria-hidden="true" className="block h-px w-full bg-border" />

// App-wide navigation header. On wide screens (md+) everything sits inline; on
// narrow screens it collapses to a burger that reveals a top-to-bottom dropdown
// over the content. Both layouts share NAV_LINKS so they never drift apart. The
// account control opens the settings dialog (which holds sign-out).
//
// `actions` is an optional slot for page-specific controls (e.g. the orders
// search + filter icons), rendered in the right cluster just before the settings
// gear so the page can add header controls without the header knowing about them.
const AppHeader = ({ actions }: { actions?: ReactNode }) => {
  const { t } = useTranslation('nav')
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  // Close the mobile menu on Escape, so keyboard users aren't trapped with the
  // overlay open. Only listens while the menu is open.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header className="relative z-30 border-b border-border">
      {/* Desktop inline header (md and up). */}
      <div data-testid="header-desktop" className="hidden items-center gap-2 px-6 py-4 md:flex">
        {/* Navigation group — destinations. */}
        {NAV_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className={navButtonClass}>
            {t(link.labelKey)}
          </NavLink>
        ))}

        {/* Divider so the create action reads as a different kind of control. */}
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />

        {/* Primary action: create an order. */}
        <NavLink to="/orders/new" className={actionButtonClass}>
          <PlusIcon />
          {t('newOrder')}
        </NavLink>

        {/* Right cluster: page actions (search/filter) then the settings gear
            (which holds the user name and sign-out), pushed to the right. */}
        <div className="ml-auto flex items-center gap-2">
          {/* Connection/sync state — renders only when offline or still flushing
              queued writes, so it stays invisible while everything is synced. */}
          <SyncStatus />
          {actions}
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label={t('settings')}
            title={t('settings')}
          >
            <GearIcon />
          </Button>
        </div>
      </div>

      {/* Mobile bar / open-menu header (below md): the burger toggle sits at the
          top-right; when the menu is open it also holds the create-order action
          on the left, in line with the close (X) toggle. `relative z-40` keeps
          this row above the backdrop and panel so it stays clickable. */}
      <div className="relative z-40 flex items-center gap-2 bg-bg px-4 py-3 md:hidden">
        {menuOpen ? (
          <NavLink to="/orders/new" className={actionButtonClass} onClick={closeMenu}>
            <PlusIcon />
            {t('addOrder')}
          </NavLink>
        ) : (
          // Page actions (search/filter) sit on the left of the bar; hidden while
          // the menu is open so the create-order action takes the row instead.
          actions
        )}
        {/* Sync state + burger, grouped on the right. SyncStatus renders only
            when offline/flushing, so normally just the burger shows here. */}
        <div className="ml-auto flex items-center gap-2">
          <SyncStatus />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border"
          >
            <BurgerIcon open={menuOpen} />
          </Button>
        </div>
      </div>

      {/* Backdrop: catches outside taps to close. Below the panel, above content.
          Only present while open so it never blocks the page otherwise. */}
      {menuOpen && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={closeMenu}
          className="fixed inset-0 z-20 cursor-default bg-black/30 md:hidden"
        />
      )}

      {/* Mobile dropdown: slides down (max-height reveal) over the content below.
          `inert` when closed removes the clipped rows from the tab order and the
          accessibility tree. `md:hidden` so it never shows on the desktop layout. */}
      <nav
        id="mobile-menu"
        aria-label={t('menu')}
        inert={!menuOpen}
        className={`absolute inset-x-0 top-full z-30 overflow-hidden border-b border-border bg-bg shadow-lg transition-[max-height] duration-300 ease-out motion-reduce:transition-none md:hidden ${
          menuOpen ? 'max-h-96' : 'max-h-0'
        }`}
      >
        {/* Divider under the action/close row that sits in the bar above. The
            bar's py-3 and the nav section's py-3 below give it equal spacing. */}
        <MenuDivider />

        {/* 1. Navigation destinations. Equal py-3 top and bottom so the items sit
            the same distance from the divider above and the one below. */}
        <div className="flex flex-col gap-1 px-4 py-3">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={mobileNavLinkClass}
              onClick={closeMenu}
            >
              {t(link.labelKey)}
            </NavLink>
          ))}
        </div>

        <MenuDivider />

        {/* 2. Account: the settings gear (which holds the user name and sign-out). */}
        <div className="flex px-4 py-3">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => {
              closeMenu()
              setSettingsOpen(true)
            }}
            aria-label={t('settings')}
            title={t('settings')}
          >
            <GearIcon />
          </Button>
        </div>
      </nav>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  )
}

export default AppHeader
