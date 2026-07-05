import { useAuth } from '@/context/authContext'

// The signed-in owner's uid (undefined until auth resolves — always present under
// ProtectedRoute, but typed optional so callers gate their queries on it). Extracted
// because nearly every screen derived it the same way (useAuth().user?.uid).
export const useOwnerId = (): string | undefined => useAuth().user?.uid
