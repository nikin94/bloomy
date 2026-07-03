import { QueryClient } from '@tanstack/react-query'

// The app's single QueryClient, tuned for the offline-first Firestore data layer.
//
// - `networkMode: 'always'` — CRITICAL. TanStack's default ('online') PAUSES a
//   query while `navigator.onLine` is false, showing a permanent "paused" state.
//   But our fetch* functions resolve from Firestore's persistent IndexedDB cache
//   when offline (that's the whole offline-first design), so the queries MUST run
//   regardless of the browser's online flag. Without this the app would hang its
//   lists whenever the user is offline.
// - `staleTime: 60s` — quick back-and-forth navigation (Orders → Stats → Orders)
//   reuses the cached, already-zod-parsed result instead of re-running getDocs and
//   re-parsing the whole collection each time. Mutations invalidate explicitly, so
//   a change is never hidden behind the stale window.
// - `refetchOnWindowFocus: false` — a data-entry app must not silently re-query and
//   re-parse the list when the tab regains focus (matches the pre-Query behaviour).
// - `refetchOnReconnect: false` — the only reconnect-driven refresh is OrdersPage's
//   reconcile hook (number the offline orders, THEN invalidate). A blanket refetch
//   of every list on reconnect wasn't the old behaviour and would read stale numbers
//   before reconcile runs.
// - `retry: 1` — an offline read from the Firestore cache never rejects; a genuine
//   transient online failure gets a single retry, never a retry-storm.
//
// A factory (not a module singleton) so tests can build a fresh, isolated client
// per render and never leak cache between cases.
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { networkMode: 'always' },
    },
  })
