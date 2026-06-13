import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import { auth } from './firebase'

// Google sign-in for the web app. We use signInWithPopup rather than
// signInWithRedirect: the redirect flow breaks in browsers that partition
// third-party storage (Safari, Chrome incognito) unless the auth helper is
// self-hosted, while popup works reliably on desktop. (Firebase JS SDK v12.)
const provider = new GoogleAuthProvider()

export const signInWithGoogle = () => signInWithPopup(auth, provider)

export const signOutUser = () => signOut(auth)
