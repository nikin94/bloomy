import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'

// Auth session exposed to the app. `loading` is true until Firebase has
// restored the persisted session on first load, so guards can wait instead of
// flashing the login screen for an already-signed-in user.
export interface AuthState {
  user: User | null
  loading: boolean
}

export const AuthContext = createContext<AuthState>({ user: null, loading: true })

export const useAuth = (): AuthState => useContext(AuthContext)
