import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
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
// not the whole Firebase Auth domain. Accounts come from either the console or
// the app's own open registration below (owner decision 2026-07-18).
export const signInWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password)

// Email/password REGISTRATION — open self-sign-up, BY DESIGN (owner decision
// 2026-07-18: new users may register themselves; data stays owner-scoped, so a
// fresh account only ever sees its own empty tenant). createUserWithEmailAndPassword
// creates the account AND signs the new user straight in, so onAuthStateChanged
// fires and the app redirects exactly like a sign-in — no separate confirm step.
// Same identitytoolkit.googleapis.com backend as sign-in (so the Crimea domain
// block hits this too). Firebase enforces a 6-character minimum password
// (auth/weak-password) and rejects a taken address (auth/email-already-in-use);
// both are surfaced to the user on the login screen.
export const registerWithEmail = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password)

// Send a "set / reset password" email. This is the fix for an account that
// already exists with ONLY the Google provider and no password (registration
// fails it with auth/email-already-in-use): clicking the emailed link sets a
// password and LINKS the password provider onto that SAME account — same uid,
// so all the user's owner-scoped orders/customers stay attached. It needs no
// prior sign-in, so a user whose Google sign-in is geo-blocked can still get a
// working email/password login. Firebase always resolves this (even for an
// unknown address) to avoid leaking which emails are registered, so the UI just
// confirms the email was sent rather than whether the account existed.
export const sendPasswordReset = (email: string) => sendPasswordResetEmail(auth, email)

export const signOutUser = () => {
  intentionalSignOut = true
  // If the sign-out call itself fails the session stays active and no auth-state
  // change fires, so clear the flag rather than leave it armed for a later drop.
  return signOut(auth).catch((err: unknown) => {
    intentionalSignOut = false
    throw err
  })
}
