import { useEffect } from 'react'
import { useQuery, useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { fetchOrders, fetchDeletedOrders, fetchOrder, reconcileOrderNumbers } from '@/firebase/orders'
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

// A single order by id. `includeDeleted` lets the detail page open a trashed order
// read-only instead of dead-ending on "not found".
export const useOrder = (
  id: string | undefined,
  ownerId: string | undefined,
  options?: { includeDeleted?: boolean },
) =>
  useQuery({
    queryKey: queryKeys.order(id, ownerId, options?.includeDeleted ?? false),
    queryFn: () => fetchOrder(id as string, ownerId as string, options),
    enabled: id !== undefined && ownerId !== undefined,
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
export const useReconcileOrderNumbers = (ownerId: string | undefined) => {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!ownerId) return
    let active = true
    const run = () =>
      reconcileOrderNumbers(ownerId)
        .then((numbered) => {
          if (active && numbered) {
            // Both lists: the reconcile scan has no deleted filter, so an order
            // created offline and then trashed gets numbered too — without this
            // the trash would keep showing "—" until its stale window lapses.
            void queryClient.invalidateQueries({ queryKey: queryKeys.orders(ownerId) })
            void queryClient.invalidateQueries({ queryKey: queryKeys.deletedOrders(ownerId) })
          }
        })
        .catch(() => {
          // Offline / Firebase unreachable: leave the list as-is, retry on reconnect.
        })
    run()
    window.addEventListener('online', run)
    return () => {
      active = false
      window.removeEventListener('online', run)
    }
  }, [ownerId, queryClient])
}
