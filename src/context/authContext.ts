import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'

// Auth session exposed to the app. `loading` is true until Firebase has
// restored the persisted session on first load, so guards can wait instead of
// flashing the login screen for an already-signed-in user.
export interface AuthState {
  user: User | null
  loading: boolean
  // True when the session ended unexpectedly — a non-null → null transition the
  // app did not initiate (i.e. not via signOutUser). The login screen reads it
  // to explain why the user was bounced instead of silently showing the sign-in
  // button. Reset on a successful sign-in.
  sessionLost: boolean
}

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  sessionLost: false,
})

export const useAuth = (): AuthState => useContext(AuthContext)
