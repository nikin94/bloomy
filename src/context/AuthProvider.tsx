import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { auth } from '../firebase/client'
import { AuthContext } from './authContext'

// Subscribes to the Firebase auth session for the whole app. onAuthStateChanged
// is the recommended observer: it fires once auth has finished initializing
// (unlike auth.currentUser, which may be null mid-init) and on every
// sign-in/sign-out afterwards.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}
