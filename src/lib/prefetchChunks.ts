// Warm a set of dynamic-import loaders so the code-split route chunks they
// resolve are fetched ahead of navigation. Once a chunk has loaded, it lives in
// the module registry (and the browser cache), so a later React.lazy load of the
// same route resolves with NO network request.
//
// Why this matters for offline: the owner pages are lazy-loaded, so a route the
// user hasn't visited yet has no chunk in memory. Navigating to it while OFFLINE
// would otherwise hang on the Suspense spinner — the chunk can't be fetched —
// until it finally errors into the crash boundary. Prefetching every route while
// online means an in-session offline visit to any page is instant.
//
// Best-effort and side-effect-only: it never throws. While offline it does
// nothing (the import would just fail), so the caller re-runs it on reconnect.
// Individual failures are swallowed so one bad chunk can't break the others.
export const prefetchChunks = (loaders: Array<() => Promise<unknown>>): void => {
  if (!navigator.onLine) return
  for (const load of loaders) {
    void load().catch(() => {
      // A transient/offline fetch failure — the chunk simply loads on demand (or
      // on the next prefetch). Nothing to surface.
    })
  }
}
