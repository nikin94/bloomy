import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'

// Mobile-bar TITLE slot — the sibling of the header-actions slot (see
// headerActionsContext). The bar's title is normally derived from the route (a
// nav destination's label); an INNER page (e.g. the order detail screen) has no
// route-derived name, but may want data-driven chrome there — the order number
// with its date — instead of leaving the bar empty next to the back control.
// The page publishes a ready-made node; the layout owns the state and the
// Sidebar renders it in the bar's title spot. Desktop is unaffected (the bar is
// md:hidden) — a page keeps its own in-content heading for that width.
export type HeaderTitleSetter = (title: ReactNode) => void

export const HeaderTitleContext = createContext<HeaderTitleSetter | null>(null)

// Publish `title` into the mobile top bar while this component is mounted,
// clearing it on unmount so it never lingers on the next screen. Same contract
// as useHeaderActions: the caller MUST memoise the node (useMemo keyed on the
// data it reads) — a fresh element every render would set layout state every
// render and loop. Null when rendered outside the layout (e.g. a bare test).
export const useHeaderTitle = (title: ReactNode): void => {
  const setTitle = useContext(HeaderTitleContext)
  useEffect(() => {
    setTitle?.(title)
    return () => setTitle?.(null)
  }, [title, setTitle])
}
