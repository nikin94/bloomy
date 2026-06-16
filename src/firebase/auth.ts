import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import { auth } from './client'

// Google sign-in for the web app. We use signInWithPopup rather than
// signInWithRedirect: the redirect flow breaks in browsers that partition
// third-party storage (Safari, Chrome incognito) unless the auth helper is
// self-hosted, while popup works reliably on desktop. (Firebase JS SDK v12.)
const provider = new GoogleAuthProvider()

// Whether the most recent sign-out was user-initiated. Set by signOutUser and
// read by AuthProvider so it can tell an INTENTIONAL sign-out apart from the
// session dropping out from under the user — the latter is almost always a
// blocked token refresh (VPN / ad blocker / antivirus HTTPS inspection) and
// deserves an explanation on the login screen, not a silent bounce to /.
let intentionalSignOut = false
export const wasSignOutIntentional = () => intentionalSignOut
export const clearIntentionalSignOut = () => {
  intentionalSignOut = false
}

export const signInWithGoogle = () => signInWithPopup(auth, provider)

export const signOutUser = () => {
  intentionalSignOut = true
  // If the sign-out call itself fails the session stays active and no auth-state
  // change fires, so clear the flag rather than leave it armed for a later drop.
  return signOut(auth).catch((err: unknown) => {
    intentionalSignOut = false
    throw err
  })
}
