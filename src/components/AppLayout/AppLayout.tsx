import { Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '@/components/Sidebar/Sidebar'
import Spinner from '@/components/Spinner/Spinner'
import RouteErrorBoundary from '@/components/RouteErrorBoundary/RouteErrorBoundary'
import { HeaderActionsContext } from '@/context/headerActionsContext'
import { HeaderTitleContext } from '@/context/headerTitleContext'

// App shell for every signed-in screen: the global navigation once, beside the
// routed page. Rendered as a layout route (inside ProtectedRoute, around the page
// routes), so the nav is guaranteed present on every page — including the order
// detail page, which used to render none — and its drawer/settings/sync state
// survive navigation instead of remounting per page.
//
// Layout: below md the sidebar is a top bar + off-canvas drawer, so the shell
// stacks vertically (bar over content); from md up the sidebar is a fixed left
// rail beside the content, giving the full-screen table more vertical room. The
// content sits in its own flex column so a page fills the remaining space exactly
// as it did under the former top header.
//
// Pages contribute their own controls (search/filter) through the header-actions
// slot: the layout owns the actions state and hands the setter to pages via
// context; a page calls useHeaderActions to publish its controls while mounted.
// Sidebar still takes `actions` as a plain prop, so it stays presentational and
// unaware of the slot.
const AppLayout = () => {
  const [actions, setActions] = useState<ReactNode>(null)
  // Mobile-bar title slot (see headerTitleContext): an inner page can name the
  // bar with its own data (the order number + date) where the route-derived
  // title is null. Owned here for the same reason as `actions`.
  const [title, setTitle] = useState<ReactNode>(null)
  // Mirror of the sidebar's mobile-drawer open state, reported up via
  // onDrawerOpenChange. While the drawer overlays the content, the page content is
  // marked `inert` so keyboard/screen-reader users can't reach what's visually
  // hidden behind the drawer (the backdrop only blocks pointer taps, not focus).
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Route path drives the content-area boundary's identity: a fresh key per route
  // remounts the Suspense + error boundary on navigation, so a page-data error
  // never sticks after the user has moved on (and each page suspends fresh).
  const { pathname } = useLocation()
  return (
    <HeaderActionsContext.Provider value={setActions}>
    <HeaderTitleContext.Provider value={setTitle}>
      <div className="flex h-full flex-col md:flex-row">
        <Sidebar actions={actions} title={title} onDrawerOpenChange={setDrawerOpen} />
        {/* bg-bg/75: a translucent theme-bg scrim under the CONTENT column.
            Since the immersion pass thinned the global photo veil (the greenery
            now carries the screen — see --greenhouse-veil), THIS layer is what
            guarantees text contrast: 75% of the theme bg over the veiled photo
            keeps the effective surface within the documented WCAG margins while
            the foliage still glows through. The sidebar rail carries its own
            lighter scrim (see Sidebar) for the same reason. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg/75" inert={drawerOpen}>
          {/* One content-area boundary + Suspense for every signed-in page: a
              page's data load suspends to the Spinner here, and a failed load
              shows the shared inline retry — the sidebar/header stay mounted
              either way. Keyed on the path so navigation resets both. */}
          <RouteErrorBoundary key={pathname}>
            <Suspense fallback={<Spinner />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </div>
      </div>
    </HeaderTitleContext.Provider>
    </HeaderActionsContext.Provider>
  )
}

export default AppLayout
