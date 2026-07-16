import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// Config is read from Vite environment variables (.env, see .env.example).
// This keeps keys out of the repository and lets us separate dev/prod projects.
const env = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// The Vitest suite doesn't set the VITE_FIREBASE_* vars — yet initializeApp +
// getAuth throw on an empty apiKey, so importing this module (directly or through
// the app tree) would crash every suite on a fresh clone unless a placeholder
// .env is added by hand. Under `MODE === 'test'` we fill each MISSING field with
// an inert placeholder so the SDK initialises. Fields are filled per-key (not the
// whole object) so a value the harness DOES inject is honoured — the emulator
// config sets VITE_FIREBASE_PROJECT_ID='demo-bloomy', which must win. Every unit
// test mocks the firebase/* layer, so these placeholders never reach a backend;
// dev/prod (MODE !== 'test') read the real env verbatim, unchanged.
const firebaseConfig =
  import.meta.env.MODE === 'test'
    ? {
        apiKey: env.apiKey ?? 'test-api-key',
        authDomain: env.authDomain ?? 'demo-bloomy.firebaseapp.com',
        projectId: env.projectId ?? 'demo-bloomy',
        storageBucket: env.storageBucket ?? 'demo-bloomy.appspot.com',
        messagingSenderId: env.messagingSenderId ?? '0',
        appId: env.appId ?? 'test-app-id',
      }
    : env

const app = initializeApp(firebaseConfig)

// Firebase Authentication — Google sign-in scopes data to the signed-in user.
// The session persists in IndexedDB, so a once-online sign-in lets the app open
// offline afterwards (only the first sign-in needs the network for the OAuth popup).
export const auth = getAuth(app)

// Whether this runtime can back the offline cache with IndexedDB. True in the
// browser; false in the Node test/emulator runtime, where IndexedDB is absent —
// there we fall back to the default in-memory cache so the data layer still
// initialises (and `connectFirestoreEmulator` can point it at the emulator).
const supportsPersistence = typeof window !== 'undefined' && typeof indexedDB !== 'undefined'

// Firestore — the main storage for orders. In the browser we enable the
// IndexedDB-backed persistent cache: reads are served from the cache when
// offline, and writes are queued locally and flushed automatically once the
// connection (or a sanctions-blocked Firebase endpoint) becomes reachable again.
// Single-tab manager rather than multi-tab: this app is used as one tab per
// device, and the single-tab manager sidesteps a class of multi-tab sync bugs in
// the firebase-js-sdk. Persistence MUST be configured here, at init, before any
// read/write — hence initializeFirestore instead of getFirestore.
//
// Note: transactions (createOrder's per-owner numbering) still require the
// network and do NOT work offline — that is handled separately (deferred
// numbering), not by this cache.
//
// experimentalAutoDetectLongPolling: when a middlebox (antivirus HTTPS
// inspection, corporate proxy) breaks Firestore's long-lived WebChannel stream,
// the SDK detects it and falls back to long-polling — plain short HTTPS
// requests such filters let through. This is the SDK's default in recent
// versions, so this is likely a no-op; it is set EXPLICITLY as insurance
// against a future default change, because this exact failure mode is real for
// us (the owner's Windows machine: Firestore worked on the phone but not the
// desktop until the antivirus real-time web filtering was tamed).
export const db: Firestore = supportsPersistence
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
      experimentalAutoDetectLongPolling: true,
    })
  : getFirestore(app)

// Cloud Storage — holds order photos under `orders/{ownerId}/{orderId}/...`.
// Owner-scoped by the path prefix and enforced by storage.rules (mirroring
// firestore.rules). Unlike Firestore there is no offline queue here, so uploads
// require a live connection; reads of already-cached images are served by the
// browser/HTTP cache.
export const storage = getStorage(app)
