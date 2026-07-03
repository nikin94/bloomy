import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCustomers, fetchCustomer } from '@/firebase/customers'
import type { Customer } from '@/types/customer'
import { queryKeys } from './keys'

// Shared empty array for the `data ?? EMPTY_CUSTOMERS` loading fallback — a stable
// reference so a page that feeds `customers` into a memo (getCustomerName →
// columns → header-actions) doesn't loop on a fresh `[]` each render. See
// EMPTY_ORDERS for the full rationale.
export const EMPTY_CUSTOMERS: Customer[] = []

// Customer reads, cached per owner. `includeDeleted` distinguishes the two callers:
// the orders list needs deleted customers too (to resolve a removed customer's name
// instead of "—"); the address book wants active ones only.
export const useCustomers = (
  ownerId: string | undefined,
  options?: { includeDeleted?: boolean },
) => {
  const includeDeleted = options?.includeDeleted ?? false
  return useQuery({
    queryKey: queryKeys.customers(ownerId, includeDeleted),
    // Preserve the original call shape: the common active-list path passes just the
    // ownerId (fetchCustomers defaults includeDeleted to false).
    queryFn: () =>
      includeDeleted
        ? fetchCustomers(ownerId as string, { includeDeleted: true })
        : fetchCustomers(ownerId as string),
    enabled: ownerId !== undefined,
  })
}

// A single customer by id (e.g. the live name on the order page). Kept null when
// the customer was deleted — a dangling customerId must not crash the page.
export const useCustomer = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.customer(id),
    queryFn: () => fetchCustomer(id as string),
    enabled: id !== undefined,
  })

// Cache writers for customer mutations. The pages already do optimistic updates
// (fire-and-forget write + reflect locally); these move that reflection into the
// query cache so every view (address book, customer page, the order detail's
// customer rows) stays consistent.
//
// RULE (standard TanStack optimistic practice): never invalidate the key you just
// optimistically wrote — the refetch would clobber the optimistic value with the
// server/cache read (and, under a static test mock, revert it). Invalidate only the
// OTHER caches that mirror the change. The granular invalidators below let each page
// invalidate everything EXCEPT the key it optimistically set.
export const useCustomerCache = () => {
  const queryClient = useQueryClient()
  return {
    // Optimistically update the single-customer cache (customer page / order
    // detail) — instant, offline-safe.
    setCustomer: (id: string, updater: (prev: Customer | null | undefined) => Customer) =>
      queryClient.setQueryData<Customer | null>(queryKeys.customer(id), updater),
    // Optimistically update the active address-book list cache (CustomersPage).
    // The list is re-sorted in the page's render, so this only maps/filters.
    setActiveList: (
      ownerId: string | undefined,
      updater: (prev: Customer[] | undefined) => Customer[],
    ) => queryClient.setQueryData<Customer[]>(queryKeys.customers(ownerId, false), updater),
    // Invalidate BOTH customer list caches (active + with-deleted). Used after a
    // SINGLE-customer optimistic edit (customer page / order detail), so the address
    // book and the orders-page name resolution re-read the change — the single
    // customer cache the caller wrote is left untouched.
    invalidateLists: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    // Invalidate only the WITH-deleted list (orders-page name resolution) and any
    // single-customer cache. Used after an ACTIVE-LIST optimistic edit
    // (CustomersPage), which already holds the change in the active-list cache.
    invalidateDerived: (ownerId: string | undefined) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers(ownerId, true) })
      void queryClient.invalidateQueries({ queryKey: ['customer'] })
    },
    // Invalidate every customer cache (both lists + single-customer). Used when
    // there is NO optimistic value to preserve — a new customer created from the
    // order form — so all caches simply refetch to pick it up.
    invalidateAll: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      void queryClient.invalidateQueries({ queryKey: ['customer'] })
    },
  }
}
