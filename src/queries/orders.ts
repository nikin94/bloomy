import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchOrders,
  fetchDeletedOrders,
  fetchOrder,
  reconcileOrderNumbers,
} from '@/firebase/orders'
import type { Order } from '@/types/order'
import { queryKeys } from './keys'

// One shared empty array for the `data ?? EMPTY_ORDERS` fallback while a query
// loads. A fresh `[]` (or a `= []` destructuring default) each render would give an
// unstable identity — on a list page that feeds `orders` into the header-actions
// memo, that unstable ref loops setActions (the #133/#134 hazard). Reusing one
// reference keeps it stable across the loading renders.
export const EMPTY_ORDERS: Order[] = []

// Order-list / order-detail reads, cached per owner. These replace the hand-rolled
// `useEffect(load).catch(setError).finally(setLoading)` scaffolding that was copied
// across the list pages: each hook returns TanStack's `{ data, isLoading, error }`
// and the QueryClient's cache doubles as the session cache (navigating away and
// back reuses the already-parsed array instead of re-querying + re-parsing).

// The owner's active orders (soft-deleted dropped). `undefined` ownerId disables
// the query (it is always present under ProtectedRoute; the guard is defensive).
export const useOrders = (ownerId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.orders(ownerId),
    queryFn: () => fetchOrders(ownerId as string),
    enabled: ownerId !== undefined,
  })

// The owner's trash (soft-deleted only).
export const useDeletedOrders = (ownerId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.deletedOrders(ownerId),
    queryFn: () => fetchDeletedOrders(ownerId as string),
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
    queryKey: queryKeys.order(id, ownerId),
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
      updater: (prev: Order | null | undefined) => Order,
    ) => queryClient.setQueryData<Order | null>(queryKeys.order(id, ownerId), updater),
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
            void queryClient.invalidateQueries({ queryKey: queryKeys.orders(ownerId) })
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
