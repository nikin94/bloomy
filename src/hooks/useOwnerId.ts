import { useAuth } from '@/context/authContext'

// The signed-in owner's uid (undefined until auth resolves — always present under
// ProtectedRoute, but typed optional so callers gate their queries on it). Extracted
// because nearly every screen derived it the same way (useAuth().user?.uid).
export const useOwnerId = (): string | undefined => useAuth().user?.uid

// The owner's uid as a guaranteed non-null string, for pages using the suspense
// query hooks (which have no `enabled` to gate on undefined). ProtectedRoute only
// mounts these pages once a user is resolved, so the throw is an invariant guard,
// not an expected path — and if it ever fires it surfaces on the route error
// boundary rather than crashing the app.
export const useRequiredOwnerId = (): string => {
  const ownerId = useOwnerId()
  if (ownerId === undefined) {
    throw new Error('useRequiredOwnerId used outside a signed-in (ProtectedRoute) context')
  }
  return ownerId
}
