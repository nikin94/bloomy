// Setup for emulator-backed tests (vitest.emulator.config.ts). Points the app's
// shared Firestore instance at the local emulator BEFORE any test runs a query,
// so the data layer exercises a real Firestore (real transactions) without
// touching the cloud project. `db` is the same singleton the data layer imports.
import { connectFirestoreEmulator } from 'firebase/firestore'
import { db } from '../firebase/config'

connectFirestoreEmulator(db, '127.0.0.1', 8080)
