import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { auth } from '@/firebase/client'
import { clearIntentionalSignOut, wasSignOutIntentional } from '@/firebase/auth'
import { AuthContext } from './authContext'

// Subscribes to the Firebase auth session for the whole app. onAuthStateChanged
// is the recommended observer: it fires once auth has finished initializing
// (unlike auth.currentUser, which may be null mid-init) and on every
// sign-in/sign-out afterwards.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionLost, setSessionLost] = useState(false)
  // Previous observed user, to detect a non-null → null transition. A ref (not
  // state) because it only feeds the next callback, not the render.
  const prevUserRef = useRef<User | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      // Going from signed-in to signed-out: if WE didn't initiate it (no
      // signOutUser call), the session dropped unexpectedly — surface it. A
      // first-load null (prevUserRef still null) is just "not logged in", not a
      // loss. Setting state inside this async observer is fine (it is not a
      // synchronous setState in an effect body).
      if (prevUserRef.current && !nextUser) {
        if (wasSignOutIntentional()) {
          clearIntentionalSignOut()
        } else {
          setSessionLost(true)
        }
      }
      // A successful (re)sign-in clears any prior loss notice.
      if (nextUser) setSessionLost(false)
      prevUserRef.current = nextUser
      setUser(nextUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, sessionLost }}>{children}</AuthContext.Provider>
  )
}
