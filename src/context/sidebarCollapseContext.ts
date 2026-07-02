import { createContext, useContext } from 'react'

// Signals the collapsed state of the desktop sidebar to the per-page controls it
// hosts (search / filter, published via the header-actions slot). When the rail
// is collapsed to its icon-only width, those controls drop their labels and show
// just their icon — but a control's DOM is opaque to the Sidebar (it renders an
// arbitrary `actions` node), so the state is passed through context instead of a
// prop. `expand` lets a collapsed control widen the rail on activation (e.g.
// clicking the search loupe re-opens the sidebar so there's room to type).
//
// Default (no provider) = expanded + a no-op expand: that's the mobile top bar,
// where the same controls render but there is no collapsible rail.
export interface SidebarCollapseValue {
  collapsed: boolean
  expand: () => void
}

export const SidebarCollapseContext = createContext<SidebarCollapseValue>({
  collapsed: false,
  expand: () => {},
})

export const useSidebarCollapse = (): SidebarCollapseValue => useContext(SidebarCollapseContext)
