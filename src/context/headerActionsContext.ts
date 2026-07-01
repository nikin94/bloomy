import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'

// Header "action slot" plumbing. The global navigation (Sidebar) lives in the app
// layout, beside every page in the route tree — so a page can no longer pass its
// per-page controls (the orders search + filter, etc.) to the nav via a prop.
// Instead the layout exposes a setter through this context; a page publishes its
// controls into the sidebar for as long as it is mounted via useHeaderActions,
// and they render in the sidebar's action cluster exactly as the old `actions`
// prop did. The context value is the setter (stable across renders); null when
// there is no provider (e.g. a component rendered outside the layout in a test).
export type HeaderActionsSetter = (actions: ReactNode) => void

export const HeaderActionsContext = createContext<HeaderActionsSetter | null>(null)

// Publish `actions` into the app header while this component is mounted, clearing
// them on unmount so a page's controls never linger on the next screen. The
// caller MUST memoise `actions` (e.g. useMemo) so its identity only changes when
// the underlying state does — otherwise a fresh node every render would set the
// layout state every render and loop. The effect keys off that stable node.
export const useHeaderActions = (actions: ReactNode): void => {
  const setActions = useContext(HeaderActionsContext)
  useEffect(() => {
    setActions?.(actions)
    return () => setActions?.(null)
  }, [actions, setActions])
}
