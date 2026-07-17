import { Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '@/components/Sidebar/Sidebar'
import Spinner from '@/components/Spinner/Spinner'
import RouteErrorBoundary from '@/components/RouteErrorBoundary/RouteErrorBoundary'
import { HeaderActionsContext } from '@/context/headerActionsContext'

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
      <div className="flex h-full flex-col md:flex-row">
        <Sidebar actions={actions} onDrawerOpenChange={setDrawerOpen} />
        {/* bg-bg/70: a translucent theme-bg scrim under the CONTENT column only.
            The photo backdrop stays at its true colours (the owner's ask), but
            the text-bearing area gets a consistent tinted underlay so table
            rows/labels don't sit straight on busy foliage. The sidebar is left
            unscrimmed — it has few, large labels and keeps the photo visible. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg/70" inert={drawerOpen}>
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
    </HeaderActionsContext.Provider>
  )
}

export default AppLayout
