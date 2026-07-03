// Centralized TanStack Query keys — one place so a queryFn and every invalidation
// or optimistic cache write always agree on the key shape (a mismatched key is a
// silent cache miss). Each list is scoped by ownerId (multi-tenancy); a foreign
// owner can never share a cache entry.
export const queryKeys = {
  // The active orders list (soft-deleted dropped) for the owner.
  orders: (ownerId: string | undefined) => ['orders', ownerId] as const,
  // The owner's trash (soft-deleted only) — a separate list from `orders`.
  deletedOrders: (ownerId: string | undefined) => ['deletedOrders', ownerId] as const,
  // A single order by id, scoped to its owner.
  order: (id: string | undefined, ownerId: string | undefined) =>
    ['order', ownerId, id] as const,
  // The owner's customers. `includeDeleted` is part of the key: the orders list
  // fetches WITH deleted (to resolve names of removed customers) while the address
  // book fetches WITHOUT — two distinct cache entries, matching the two fetches.
  customers: (ownerId: string | undefined, includeDeleted: boolean) =>
    ['customers', ownerId, { includeDeleted }] as const,
  // A single customer by id.
  customer: (id: string | undefined) => ['customer', id] as const,
}
