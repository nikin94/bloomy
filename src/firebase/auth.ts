import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
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

// Email/password sign-in. Added as an ALTERNATIVE to the Google popup for the
// Crimea user, whose machine blocks the Google OAuth flow (accounts.google.com).
// Note this still talks to identitytoolkit.googleapis.com — the same Auth backend
// the popup uses — so it only helps if the block is specific to the OAuth flow,
// not the whole Firebase Auth domain. Accounts are created admin-side (Firebase
// console) — there is no open sign-up.
export const signInWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password)

// Email/password REGISTRATION (open self-sign-up). createUserWithEmailAndPassword
// creates the account AND signs the new user straight in, so onAuthStateChanged
// fires and the app redirects exactly like a sign-in — no separate confirm step.
// Same identitytoolkit.googleapis.com backend as sign-in (so the Crimea domain
// block hits this too). Firebase enforces a 6-character minimum password
// (auth/weak-password) and rejects a taken address (auth/email-already-in-use);
// both are surfaced to the user on the login screen.
export const registerWithEmail = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password)

export const signOutUser = () => {
  intentionalSignOut = true
  // If the sign-out call itself fails the session stays active and no auth-state
  // change fires, so clear the flag rather than leave it armed for a later drop.
  return signOut(auth).catch((err: unknown) => {
    intentionalSignOut = false
    throw err
  })
}
