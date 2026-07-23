import { useEffect } from 'react'
import { useQuery, useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchOrders,
  fetchDeletedOrders,
  fetchOrder,
  reconcileOrderNumbers,
  waitForWriteQueueFlush,
} from '@/firebase/orders'
import type { ReconcileResult } from '@/firebase/orders'
import type { Order } from '@/types/order'
import { queryKeys } from './keys'

// Order-list / order-detail reads, cached per owner. These replace the hand-rolled
// `useEffect(load).catch(setError).finally(setLoading)` scaffolding that was copied
// across the list pages, and the QueryClient's cache doubles as the session cache
// (navigating away and back reuses the already-parsed array instead of re-querying
// + re-parsing).
//
// The two LIST reads SUSPEND: the list pages gate on the route-level
// <Suspense>/error boundary (see AppLayout) instead of their own loading/error
// locals. `useSuspenseQuery` has no `enabled`, so the owner MUST be resolved —
// callers pass a non-null uid via useRequiredOwnerId (guaranteed under
// ProtectedRoute). `data` is therefore always defined (no empty-array fallback) and
// its reference is stable across renders (same identity guarantee as useQuery), so
// header-actions memos keyed on it stay stable. A background refetch (e.g. after
// reconcile invalidates) keeps the last data and does NOT re-suspend, so there is
// no spinner flash mid-session.

// The owner's active orders (soft-deleted dropped).
export const useOrdersSuspense = (ownerId: string) =>
  useSuspenseQuery({
    queryKey: queryKeys.orders(ownerId),
    queryFn: () => fetchOrders(ownerId),
  })

// The owner's trash (soft-deleted only).
export const useDeletedOrdersSuspense = (ownerId: string) =>
  useSuspenseQuery({
    queryKey: queryKeys.deletedOrders(ownerId),
    queryFn: () => fetchDeletedOrders(ownerId),
  })

// NON-suspending variant of the active-orders list, on the SAME cache key as
// useOrdersSuspense — the two share one entry, so a form mounted right after the
// orders list reuses the already-parsed array instead of re-running getDocs. For
// callers whose data is a nice-to-have (the order form's plant-name suggestions
// and gift history): a suspense read there would gate the whole form on a fetch
// it can happily render without.
export const useOrders = (ownerId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.orders(ownerId),
    queryFn: () => fetchOrders(ownerId as string),
    enabled: ownerId !== undefined,
  })

// SUSPENDING single-order read for the detail/edit screens, on the SAME cache
// key as useOrder (one shared entry — useOrderCache's optimistic setOrder still
// lands here). Suspending is what keeps the loading UX ONE spinner: the lazy
// route chunk and this data read fall to the same route-level <Suspense>
// (AppLayout), so its fallback stays mounted continuously instead of handing
// off to a page-local Spinner that restarts the ring animation. There is no
// `enabled` on suspense queries, so the possibly-missing route param is folded
// into the queryFn: no id ⇒ resolve null, the caller's "not found" branch.
// A fetch FAILURE now throws to the route error boundary (the shared inline
// retry, same as the list pages) instead of a page-local error line.
export const useOrderSuspense = (
  id: string | undefined,
  ownerId: string,
  options?: { includeDeleted?: boolean },
) =>
  useSuspenseQuery({
    queryKey: queryKeys.order(id, ownerId, options?.includeDeleted ?? false),
    queryFn: () => (id === undefined ? null : fetchOrder(id, ownerId, options)),
  })


// Cache writers for order mutations. Invalidation uses the KEY PREFIX (`['orders']`
// etc. — the first segment of the keys above), so a thin caller like NewOrderPage
// needn't thread ownerId through; prefix-matching invalidates every owner's cache,
// which is correct (there is effectively one owner per device).
export const useOrderCache = () => {
  const queryClient = useQueryClient()
  return {
    // Optimistic order-detail update (a status/photo change): instant and
    // offline-safe, with no dependence on a refetch settling.
    setOrder: (
      ownerId: string | undefined,
      id: string,
      includeDeleted: boolean,
      updater: (prev: Order | null | undefined) => Order,
    ) =>
      queryClient.setQueryData<Order | null>(
        queryKeys.order(id, ownerId, includeDeleted),
        updater,
      ),
    // The list caches are now stale (a row's status/photo changed) — refetch them
    // so returning to a list within the stale window shows the change. NOT the
    // order-detail cache (setOrder already holds the optimistic value there).
    invalidateLists: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['deletedOrders'] })
    },
    // Every order cache — the lists AND any cached order detail. Used on
    // create / edit / soft-delete / restore, where the row moves or is new.
    invalidateAll: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['deletedOrders'] })
      void queryClient.invalidateQueries({ queryKey: ['order'] })
    },
  }
}

// Background: assign real per-owner numbers to any orders created offline, then
// invalidate the orders list so the freshly-numbered rows refetch. Runs on mount
// and on reconnect; best-effort, never throws. This replaces OrdersPage's
// hand-rolled load()+reconcile() dual-fetch AND fixes its race — invalidation makes
// TanStack run a single refetch that always supersedes any in-flight one, so a
// stale snapshot can no longer clobber the freshly-numbered data.
//
// Floor delay before the SECOND and later retry passes. The first retry rides
// the queue flush alone — in the real stall the flush IS the connectivity
// window, and waiting past it would miss it. But the flush resolves
// immediately when the queue is already empty (and it is a GLOBAL queue — a
// settings write can drain it before the order create lands, see
// waitForWriteQueueFlush), so without a floor the remaining passes would burn
// back-to-back within milliseconds while Firestore is still unreachable.
const RECONCILE_RETRY_FLOOR_MS = 30_000
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// RETRY: a failed pass (remaining: true — Firestore unreachable mid-numbering)
// re-arms on waitForWriteQueueFlush, which resolves when the queued local
// writes reach the server, i.e. when connectivity actually returns. The
// `online` event alone is NOT enough — when only Firestore is blocked
// (antivirus SSL inspection) the OS network stays "up" and the event never
// fires; that gap is precisely how orders sat at number:null for days while
// their create writes slipped through brief connectivity windows the reconcile
// never saw. A few passes per trigger, not an unbounded loop; passes after the
// first retry additionally wait out RECONCILE_RETRY_FLOOR_MS, so an
// instantly-resolving flush cannot spin the bounded loop hot.
export const useReconcileOrderNumbers = (ownerId: string | undefined) => {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!ownerId) return
    let active = true
    // Re-entrancy: `running` collapses overlapping triggers (an `online` event
    // firing while a run is mid-flight must not start a SECOND interleaved
    // loop — two loops share nothing and would double every pass); `rerun`
    // remembers that a trigger arrived mid-run so the signal isn't lost — the
    // finished run starts one fresh pass-loop in its place.
    let running = false
    let rerun = false
    const run = async () => {
      if (running) {
        rerun = true
        return
      }
      running = true
      try {
        for (let pass = 0; active && pass < 3; pass++) {
          let outcome: ReconcileResult
          try {
            outcome = await reconcileOrderNumbers(ownerId)
          } catch {
            // The listing itself failed (offline, no cache) — leave the list
            // as-is and retry on the next trigger.
            return
          }
          if (!active) return
          if (outcome.numbered) {
            // Both lists: the reconcile scan has no deleted filter, so an order
            // created offline and then trashed gets numbered too — without this
            // the trash would keep showing "—" until its stale window lapses.
            void queryClient.invalidateQueries({ queryKey: queryKeys.orders(ownerId) })
            void queryClient.invalidateQueries({ queryKey: queryKeys.deletedOrders(ownerId) })
          }
          if (!outcome.remaining) return
          try {
            await waitForWriteQueueFlush()
          } catch {
            return
          }
          // First retry (pass 0 → 1) goes immediately — the flush was the
          // connectivity window. Later ones wait out the floor; see above.
          if (pass >= 1) await sleep(RECONCILE_RETRY_FLOOR_MS)
        }
      } finally {
        running = false
        if (rerun && active) {
          rerun = false
          void run()
        }
      }
    }
    const trigger = () => void run()
    trigger()
    window.addEventListener('online', trigger)
    return () => {
      active = false
      window.removeEventListener('online', trigger)
    }
  }, [ownerId, queryClient])
}
