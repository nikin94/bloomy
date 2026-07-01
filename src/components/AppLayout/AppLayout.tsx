import { useState } from 'react'
import type { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import AppHeader from '../AppHeader/AppHeader'
import { HeaderActionsContext } from '../../context/headerActionsContext'

// App shell for every signed-in screen: the global header once, above the routed
// page. Rendered as a layout route (inside ProtectedRoute, around the page
// routes), so the header is guaranteed present on every page — including the
// order detail page, which used to render no header at all — and its menu/
// settings/sync state survive navigation instead of remounting per page.
//
// Pages contribute their own header controls (search/filter) through the
// header-actions slot: the layout owns the actions state and hands the setter to
// pages via context; a page calls useHeaderActions to publish its controls while
// mounted. AppHeader still takes `actions` as a plain prop, so it stays a pure
// presentational component unaware of the slot.
const AppLayout = () => {
  const [actions, setActions] = useState<ReactNode>(null)
  return (
    <HeaderActionsContext.Provider value={setActions}>
      <div className="flex h-full flex-col">
        <AppHeader actions={actions} />
        <Outlet />
      </div>
    </HeaderActionsContext.Provider>
  )
}

export default AppLayout
