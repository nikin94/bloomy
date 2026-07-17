import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Button from '@/components/Button/Button'
import SyncStatus from '@/components/SyncStatus/SyncStatus'
import { useAuth } from '@/context/authContext'
import { SidebarCollapseContext } from '@/context/sidebarCollapseContext'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { isAdmin } from '@/lib/admin'
import { settingsSectionsFor, isSettingsSection } from '@/components/Settings/sections'
import { FOCUS_RING } from '@/styles/fieldStyles'
import { cn } from '@/lib/cn'
import RailLabel from './RailLabel'
import OrdersIcon from '@/components/icons/OrdersIcon'
import CustomersIcon from '@/components/icons/CustomersIcon'
import StatsIcon from '@/components/icons/StatsIcon'
import TrashIcon from '@/components/icons/TrashIcon'
import BackIcon from '@/components/icons/BackIcon'
import PlusIcon from '@/components/icons/PlusIcon'
import GearIcon from '@/components/icons/GearIcon'
import BurgerIcon from '@/components/icons/BurgerIcon'
import ChevronIcon from '@/components/icons/ChevronIcon'
import CollapseChevron from '@/components/icons/CollapseChevron'

// The nav-icon prop shape, kept for the NAV_LINKS `Icon` typing below. The icon
// components themselves now live one-per-file under ../icons.
type IconProps = { className?: string }

// Navigation destinations, defined once so a new section is added in ONE place
// and appears in both the desktop rail and the mobile drawer. Each carries an
// `Icon` so a row reads icon + label (and, collapsed, the icon stands alone).
// `end` keeps "Orders" active only on the exact list route, not on /orders/new.
const NAV_LINKS: {
  to: string
  labelKey: 'orders' | 'customers' | 'stats' | 'trash'
  Icon: FC<IconProps>
  end?: boolean
}[] = [
  { to: '/orders', labelKey: 'orders', Icon: OrdersIcon, end: true },
  { to: '/customers', labelKey: 'customers', Icon: CustomersIcon },
  { to: '/stats', labelKey: 'stats', Icon: StatsIcon },
  { to: '/orders/deleted', labelKey: 'trash', Icon: TrashIcon },
]

// The top-level destinations reachable straight from the nav — these ARE the
// "top screen", so they get no back control. Every OTHER signed-in route is an
// inner page (an order/customer detail, the create/edit form) that a mobile back
// button returns UP from. Derived from NAV_LINKS plus /settings (also a sidebar
// destination, just rendered in the bottom cluster rather than the nav list).
const TOP_LEVEL_PATHS = [...NAV_LINKS.map((link) => link.to), '/settings']

// localStorage key for the desktop rail's collapsed state, so the user's choice
// survives a reload instead of resetting to expanded every visit.
const COLLAPSED_KEY = 'bloomy-sidebar-collapsed'
const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}
const writeCollapsed = (next: boolean) => {
  try {
    localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
  } catch {
    // Private mode / storage disabled — the choice just won't survive a reload.
  }
}

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

// Shared horizontal layout for every rail row (nav, create, settings). The row is
// ALWAYS icon-left at a fixed `px-2.5` inset — collapsing no longer switches it to a
// centred icon box (which dropped the label instantly). Instead the label fades and
// the narrowing rail clips it away (`overflow-hidden` + the fading RailLabel). The
// icon keeps its `px-2.5` offset, so its centre sits at 32px in BOTH the full rail
// and the 64px collapsed strip (12px rail pad + 10px row pad + half a 20px icon = 32
// = half of 64) — it never slides. `overflow-hidden` lets the rail swallow the label.
const RAIL_ROW = 'gap-2 px-2.5 overflow-hidden'

// A nav destination in the vertical rail/drawer: a row, filled when its route is
// active. Collapsing fades its label out (see RailLabel), not the row itself.
const navRowClass = (isActive: boolean) =>
  cn(
    'flex items-center rounded-md py-2 text-sm font-medium no-underline transition-colors',
    RAIL_ROW,
    FOCUS_RING,
    isActive ? 'bg-primary text-white' : 'text-heading hover:bg-primary-bg',
  )

// The "New order" ACTION (it creates) gets the primary treatment so it reads as
// the main action, not a fifth nav tab. Its plus stays put; the label fades on collapse.
const createRowClass = cn(
  'flex items-center whitespace-nowrap rounded-md bg-primary py-2 text-sm font-medium text-white no-underline transition-opacity hover:opacity-90',
  RAIL_ROW,
  FOCUS_RING,
)

// The "Settings" control. It is no longer a link to /settings — it TOGGLES the
// section nav (a flyout on desktop, an accordion in the mobile drawer); navigation
// to /settings happens only when a section is picked. Styled like a nav destination,
// filled when settings is active; its gear stays put and the label fades on collapse.
const settingsToggleClass = (active: boolean) =>
  cn(
    'flex items-center rounded-md py-2 text-sm font-medium transition-colors',
    RAIL_ROW,
    FOCUS_RING,
    active ? 'bg-primary text-white' : 'text-heading hover:bg-primary-bg',
  )

// A section row in the settings nav (flyout / drawer accordion). A LIGHTER register
// than the main destinations — muted normal-weight text, the active section
// accent-coloured on a soft bg-primary-bg tint — so the second level reads as
// subordinate to the main nav rather than a peer of it. Tight horizontal padding
// (px-2) keeps the narrow flyout's content close to its edges.
const sectionLinkClass = (selected: boolean) =>
  cn(
    'flex items-center rounded-md px-2 py-2 text-sm no-underline transition-colors',
    FOCUS_RING,
    selected ? 'bg-primary-bg font-semibold text-primary' : 'font-normal text-text hover:text-heading',
  )

// App-wide navigation, as a LEFT sidebar (replaces the former top header). On wide
// screens (md+) it is a fixed vertical rail beside the content; a chevron toggle on
// its right edge COLLAPSES it to a thin icon-only strip (labels drop, icons stay),
// freeing horizontal space for the table — the choice is persisted. Below md it
// collapses to a thin top bar with a burger that reveals an off-canvas drawer.
// Both layouts share NAV_LINKS.
//
// `actions` is the per-page controls slot (e.g. the orders search + filter),
// published by the page via useHeaderActions and rendered here so the sidebar
// stays unaware of what a page contributes.
const Sidebar = ({
  actions,
  // Reports the mobile-drawer open state up to AppLayout, which marks the page
  // content `inert` while the drawer overlays it. Optional so the Sidebar renders
  // standalone (its own tests) without a host.
  onDrawerOpenChange,
}: {
  actions?: ReactNode
  onDrawerOpenChange?: (open: boolean) => void
}) => {
  const { t } = useTranslation('nav')
  // Section labels live in the `settings` namespace (shared with the page).
  const { t: tSettings } = useTranslation('settings')
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  // The rail (md+) and the mobile top bar are BOTH in the DOM (CSS toggles which
  // is visible), but the page's `actions` node (search + filter — stateful, with
  // its own input, timers, focus handling and modal) must render in only ONE of
  // them at a time: mounting it in both spins up two independent instances bound
  // to one shared value. Gate on a live media query (Tailwind's md breakpoint) so
  // exactly one instance is ever alive.
  const isDesktop = useMediaQuery('(min-width: 768px)')
  // Desktop rail collapse (icon-only strip). Persisted so it survives reloads.
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      writeCollapsed(!c)
      return !c
    })
  // Widen the rail back out — used by a collapsed page control (e.g. the search
  // loupe) so activating it makes room for itself instead of expanding into 0px.
  const expandSidebar = useCallback(() => {
    setCollapsed((c) => {
      if (c) writeCollapsed(false)
      return false
    })
  }, [])
  // Collapse the rail again — used by a page control that widened it for itself
  // (the search field) to restore the user's collapsed layout when it closes.
  const collapseSidebar = useCallback(() => {
    setCollapsed((c) => {
      if (!c) writeCollapsed(true)
      return true
    })
  }, [])
  // The context passed to the hosted page controls (search / filter), so they can
  // drop their labels when collapsed and re-open / re-collapse the rail around
  // their own activation.
  const collapseValue = useMemo(
    () => ({ collapsed, expand: expandSidebar, collapse: collapseSidebar }),
    [collapsed, expandSidebar, collapseSidebar],
  )
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

  // The mobile top bar names the current page on its far left — the phone has no
  // visible sidebar highlight to tell you where you are (unlike the desktop rail).
  // Derived from the route: a nav destination's label, or — on /settings — the
  // active section's label. Inner pages (detail / create-edit forms) show the
  // back control there instead and keep their own in-content <h1>, so they get no
  // bar title (null).
  const navLink = NAV_LINKS.find((link) => link.to === location.pathname)
  const pageTitle = onSettings
    ? tSettings(`tabs.${currentSection}` as const)
    : navLink
      ? t(navLink.labelKey)
      : null

  // The desktop settings flyout: a second-level panel that slides out horizontally
  // from under the main rail when "Settings" is toggled. It STARTS open when you
  // enter the settings route (so the section list is there on arrival) and closes
  // when you leave; the toggle flips it in between — including closing it in place
  // while still on /settings, or peeking the sections from another page.
  // Navigation happens only when a section is picked.
  const [flyoutOpen, setFlyoutOpen] = useState(onSettings)
  // The mobile drawer's settings accordion — independent of the desktop flyout.
  const [settingsExpanded, setSettingsExpanded] = useState(onSettings)
  // Sync BOTH to the route on ANY navigation by adjusting state during render (the
  // pattern React recommends over an effect): each route change re-derives the
  // open state from whether the new route is /settings — so entering /settings
  // opens them, and navigating to ANY other route collapses them. Keying on the
  // pathname (not just the onSettings boolean) is what closes a flyout peeked open
  // on one non-settings page when moving to another non-settings page — there the
  // boolean never changes, so a boolean-only guard would leave it open. Switching
  // sections within /settings keeps the same pathname, so it doesn't re-sync.
  const [syncedPath, setSyncedPath] = useState(location.pathname)
  if (location.pathname !== syncedPath) {
    setSyncedPath(location.pathname)
    setFlyoutOpen(onSettings)
    setSettingsExpanded(onSettings)
  }
  // Collapse the drawer accordion whenever the drawer closes on a non-settings
  // page, so a section list left expanded isn't still open the next time the
  // drawer is opened there. (On /settings it stays expanded — that's where it
  // belongs.) Same render-time adjustment, keyed on the drawer's open state.
  const [wasMenuOpen, setWasMenuOpen] = useState(menuOpen)
  if (menuOpen !== wasMenuOpen) {
    setWasMenuOpen(menuOpen)
    if (!menuOpen && !onSettings) setSettingsExpanded(false)
  }

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

  // Drawer a11y + host notification, all keyed on the open state:
  //  • report open→AppLayout so it can `inert` the page content behind the overlay;
  //  • lock body scroll while open so the content underneath can't scroll away;
  //  • move focus INTO the drawer on open (first control) and RETURN it to the
  //    burger on close, so keyboard focus is never stranded on hidden content.
  // The drawer's own `id` is used to find its first control and the burger (by its
  // aria-controls) without threading refs through the Button component.
  useEffect(() => {
    onDrawerOpenChange?.(menuOpen)
    if (!menuOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document
      .getElementById('mobile-drawer')
      ?.querySelector<HTMLElement>('a, button')
      ?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      document.querySelector<HTMLElement>('[aria-controls="mobile-drawer"]')?.focus()
    }
  }, [menuOpen, onDrawerOpenChange])

  // The nav destinations, shared by the rail and the drawer. `onNavigate` closes
  // the drawer after a pick (a no-op on the desktop rail). `collapsed` drops the
  // labels (rail icon-strip); it's always false in the drawer. When collapsed the
  // label moves to aria-label + title so the icon-only row stays named.
  const destinations = (onNavigate: (() => void) | undefined, collapsed: boolean) =>
    NAV_LINKS.map(({ to, labelKey, Icon, end }) => {
      const label = t(labelKey)
      return (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) => navRowClass(isActive)}
        >
          <Icon className="size-5 shrink-0" />
          <RailLabel collapsed={collapsed}>{label}</RailLabel>
        </NavLink>
      )
    })

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
          <span className="truncate">{tSettings(`tabs.${key}` as const)}</span>
        </Link>
      )
    })

  return (
    <>
      {/* Desktop rail (md and up): a vertical column beside the content. `relative`
          anchors the collapse toggle on its right edge. Its width animates between
          the full rail and a thin icon strip. */}
      <nav
        id="sidebar-nav"
        data-testid="sidebar-desktop"
        data-collapsed={collapsed}
        aria-label={t('menu')}
        className={cn(
          // bg-bg/55: a lighter scrim than the content column's — the nav
          // labels sit straight on the photo backdrop, and the thinned global
          // veil (immersion pass) no longer dims it enough for text on its own.
          // Lighter than the content's 75% on purpose: the rail is where the
          // greenery shows most, so it keeps more of the photo.
          'relative hidden shrink-0 flex-col gap-2 border-r border-border bg-bg/55 p-3 transition-[width] duration-300 ease-out motion-reduce:transition-none md:flex',
          collapsed ? 'w-16' : 'w-48',
        )}
      >
        {/* Collapse toggle: a small chevron button straddling the rail's right edge
            at its vertical middle. Click collapses the rail to icons / expands it.
            `aria-controls` ties it to the rail it collapses so AT announces the link. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          aria-expanded={!collapsed}
          aria-controls="sidebar-nav"
          // The button straddles the rail's right border, so its fill must stay
          // OPAQUE — a translucent hover (bg-primary-bg is an alpha tint) would let
          // the border line show through under it. So keep the solid bg-bg on hover
          // and signal hover with a colour change instead: the border + icon turn
          // primary.
          className={cn(
            'absolute right-0 top-1/2 z-30 flex size-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-border bg-bg text-text shadow-sm transition-colors hover:border-primary hover:text-primary',
            FOCUS_RING,
          )}
        >
          <CollapseChevron
            className={cn(
              'size-4 transition-transform motion-reduce:transition-none',
              collapsed && 'rotate-180',
            )}
          />
        </button>

        <NavLink
          to="/orders/new"
          className={createRowClass}
          title={collapsed ? t('newOrder') : undefined}
          aria-label={t('newOrder')}
        >
          <PlusIcon className="size-5 shrink-0" />
          <RailLabel collapsed={collapsed}>{t('newOrder')}</RailLabel>
        </NavLink>

        <span aria-hidden="true" className="my-1 h-px w-full bg-border" />

        <div className="flex flex-col gap-1">{destinations(undefined, collapsed)}</div>

        {/* Bottom cluster, pinned via mt-auto and split off by a top divider: the
            page's per-page controls (search / filter), the sync indicator (only
            shows when offline or flushing), and the settings control. The controls
            render as the same borderless icon+label rows as settings, so the whole
            cluster reads as one consistent list — and follows the rail into
            icon-only via the collapse context. Sync is hidden while collapsed (its
            badge carries text that can't fit the thin strip). */}
        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-2">
          {actions && isDesktop && (
            <SidebarCollapseContext.Provider value={collapseValue}>
              <div className="flex flex-col items-stretch gap-1">{actions}</div>
            </SidebarCollapseContext.Provider>
          )}
          {!collapsed && <SyncStatus />}
          <button
            type="button"
            onClick={() => setFlyoutOpen((open) => !open)}
            aria-expanded={flyoutOpen}
            aria-controls="settings-flyout"
            title={collapsed ? t('settings') : undefined}
            aria-label={t('settings')}
            className={settingsToggleClass(onSettings)}
          >
            <GearIcon className="size-5 shrink-0" />
            <RailLabel collapsed={collapsed}>{t('settings')}</RailLabel>
          </button>
        </div>
      </nav>

      {/* Desktop settings flyout (md and up): a second-level section nav that slides
          out horizontally from under the main rail. Animates its width (0 ↔ open)
          so it appears to emerge from behind the rail; the inner column keeps a
          fixed width so its rows don't reflow mid-animation. `inert` when closed
          drops its links from the tab order. A section pick navigates to
          /settings?section=… (the only route onto the settings screen). */}
      <nav
        id="settings-flyout"
        data-testid="settings-flyout"
        aria-label={tSettings('tabsAria')}
        inert={!flyoutOpen}
        className={cn(
          'hidden shrink-0 overflow-hidden bg-surface transition-[width] duration-300 ease-out motion-reduce:transition-none md:block',
          flyoutOpen ? 'w-40 border-r border-border' : 'w-0',
        )}
      >
        <div className="flex w-40 flex-col gap-1 p-3">{sectionLinks()}</div>
      </nav>

      {/* Mobile top bar (below md). Left: the current page title (or the back
          control on an inner page) — it names the screen, since there's no visible
          sidebar highlight on a phone. Then any page controls (search / filter),
          the sync indicator, then the burger far right (as everywhere).
          When the search field is OPEN it should own the row: the control marks
          itself `.js-search-open`, so `group-has` hides the title (freeing the whole
          width) and `has-…:flex-1` lets the page-controls wrapper grow to fill it.
          While closed the title keeps its flex-1 (pushing the controls + burger to
          the right edge). Sync + burger stay fixed (shrink-0) as the anchored edge. */}
      {/* px-2 py-1.5 (was px-4 py-3): halved with the rest of the phone screen
          gutters (owner request) — the bar's controls carry their own hit-area
          padding, so the thinner chrome stays tappable. */}
      <div className="group flex items-center gap-2 border-b border-border bg-bg px-2 py-1.5 md:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2 group-has-[.js-search-open]:hidden">
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
          {pageTitle && (
            <h1 className="m-0 min-w-0 truncate text-lg font-semibold text-heading">{pageTitle}</h1>
          )}
        </div>
        {actions && !isDesktop && (
          <div className="flex min-w-0 items-center justify-end gap-2 has-[.js-search-open]:flex-1">
            {actions}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <SyncStatus />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
            aria-expanded={menuOpen}
            aria-controls="mobile-drawer"
            className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border"
          >
            <BurgerIcon open={menuOpen} />
          </Button>
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
          a11y tree. `md:hidden` so it never shows on the desktop layout. The drawer
          is never collapsed (that's a desktop-rail affordance), so its rows always
          show icon + label. */}
      <nav
        id="mobile-drawer"
        data-testid="mobile-drawer"
        aria-label={t('menu')}
        inert={!menuOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 max-w-[80%] flex-col gap-2 border-r border-border bg-bg p-4 shadow-lg transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <NavLink to="/orders/new" className={createRowClass} onClick={closeMenu}>
          <PlusIcon className="size-5 shrink-0" />
          {t('addOrder')}
        </NavLink>

        <span aria-hidden="true" className="my-1 h-px w-full bg-border" />

        <div className="flex flex-col gap-1">{destinations(closeMenu, false)}</div>

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
            <GearIcon className="size-5 shrink-0" />
            {t('settings')}
            <ChevronIcon
              className={cn(
                'ml-auto size-4 transition-transform motion-reduce:transition-none',
                !settingsExpanded && 'rotate-180',
              )}
            />
          </button>
          {/* The section list reveals with a smooth height animation (max-height,
              same easing as the drawer itself) instead of snapping in/out, so it
              feels like part of the main menu. `inert` when collapsed keeps the
              (clipped) links out of the tab order and the a11y tree. */}
          <div
            id="drawer-settings-sections"
            inert={!settingsExpanded}
            className={cn(
              'overflow-hidden transition-[max-height] duration-300 ease-out motion-reduce:transition-none',
              settingsExpanded ? 'max-h-96' : 'max-h-0',
            )}
          >
            <div className="flex flex-col gap-1 pl-4 pt-1">{sectionLinks(closeMenu)}</div>
          </div>
        </div>
      </nav>
    </>
  )
}

export default Sidebar
