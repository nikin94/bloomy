import { useState } from 'react'
import type { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../Sidebar/Sidebar'
import { HeaderActionsContext } from '../../context/headerActionsContext'

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
  return (
    <HeaderActionsContext.Provider value={setActions}>
      <div className="flex h-full flex-col md:flex-row">
        <Sidebar actions={actions} onDrawerOpenChange={setDrawerOpen} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" inert={drawerOpen}>
          <Outlet />
        </div>
      </div>
    </HeaderActionsContext.Provider>
  )
}

export default AppLayout
