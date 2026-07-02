import { createContext, useContext } from 'react'

// Signals the collapsed state of the desktop sidebar to the per-page controls it
// hosts (search / filter, published via the header-actions slot). When the rail
// is collapsed to its icon-only width, those controls drop their labels and show
// just their icon — but a control's DOM is opaque to the Sidebar (it renders an
// arbitrary `actions` node), so the state is passed through context instead of a
// prop. `expand` lets a collapsed control widen the rail on activation (e.g.
// clicking the search loupe re-opens the sidebar so there's room to type);
// `collapse` puts it back, so a control that expanded the rail for itself can
// restore the user's collapsed layout when it's done (the search X / Escape
// returns the rail to how it was before the field opened).
//
// Default (no provider) = expanded + no-op expand/collapse: that's the mobile
// top bar, where the same controls render but there is no collapsible rail.
export interface SidebarCollapseValue {
  collapsed: boolean
  expand: () => void
  collapse: () => void
}

export const SidebarCollapseContext = createContext<SidebarCollapseValue>({
  collapsed: false,
  expand: () => {},
  collapse: () => {},
})

export const useSidebarCollapse = (): SidebarCollapseValue => useContext(SidebarCollapseContext)
