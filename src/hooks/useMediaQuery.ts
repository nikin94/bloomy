import { useCallback, useSyncExternalStore } from 'react'

// Subscribe to a CSS media query and re-render when it flips. Used so a component
// can render a subtree for ONLY the matching layout instead of relying on
// `hidden`/`md:` CSS to hide a duplicate — CSS keeps both subtrees MOUNTED (their
// state, timers, focus handling and portals all live at once), which for a
// stateful control (the page's search/filter, rendered in both the desktop rail
// and the mobile bar) means two independent instances bound to one shared value.
// Gating the render on the query keeps exactly one instance alive.
//
// `useSyncExternalStore` is the tear-free way to read an external source (the
// MediaQueryList) during render. The subscribe callback is memoised on `query`
// so it isn't recreated every render (which would re-subscribe a fresh
// MediaQueryList each commit). The server snapshot returns false — this is a
// client SPA, so it is never actually read, but the API requires it. Guarded for
// environments without matchMedia (older jsdom) so it degrades to false there.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = () =>
    typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
