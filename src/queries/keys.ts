// Centralized TanStack Query keys — one place so a queryFn and every invalidation
// or optimistic cache write always agree on the key shape (a mismatched key is a
// silent cache miss). Each list is scoped by ownerId (multi-tenancy); a foreign
// owner can never share a cache entry.
export const queryKeys = {
  // The active orders list (soft-deleted dropped) for the owner.
  orders: (ownerId: string | undefined) => ['orders', ownerId] as const,
  // The owner's trash (soft-deleted only) — a separate list from `orders`.
  deletedOrders: (ownerId: string | undefined) => ['deletedOrders', ownerId] as const,
  // A single order by id, scoped to its owner. `includeDeleted` is part of the key
  // (like `customers` below): OrderDetailPage reads WITH deleted (a trashed order
  // opens read-only), EditOrderPage reads WITHOUT (trashed → null → "not found").
  // Without the flag both callers would share one entry, so a cached trashed order
  // from the detail page would let the edit page treat it as active (writing to a
  // soft-deleted doc), and vice versa a cached `null` would hide the deleted banner.
  order: (id: string | undefined, ownerId: string | undefined, includeDeleted: boolean) =>
    ['order', ownerId, id, { includeDeleted }] as const,
  // The owner's customers. `includeDeleted` is part of the key: the orders list
  // fetches WITH deleted (to resolve names of removed customers) while the address
  // book fetches WITHOUT — two distinct cache entries, matching the two fetches.
  customers: (ownerId: string | undefined, includeDeleted: boolean) =>
    ['customers', ownerId, { includeDeleted }] as const,
  // A single customer by id.
  customer: (id: string | undefined) => ['customer', id] as const,
}
