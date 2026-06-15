import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './client'
import { STORED_SETTINGS_SCHEMA } from '../types/settings'
import type { StoredSettings } from '../types/settings'

// Per-user settings live at settings/{uid} — the doc id IS the owner uid (like
// counters), so the security rules authorize by path, not a body field.
const SETTINGS_COLLECTION = 'settings'

// Load the signed-in user's settings, or an empty object when none are saved yet.
export async function fetchSettings(uid: string): Promise<StoredSettings> {
  const snapshot = await getDoc(doc(db, SETTINGS_COLLECTION, uid))
  return snapshot.exists() ? STORED_SETTINGS_SCHEMA.parse(snapshot.data()) : {}
}

// Persist settings, merging so a partial write never drops other fields.
export async function saveSettings(uid: string, settings: StoredSettings): Promise<void> {
  await setDoc(doc(db, SETTINGS_COLLECTION, uid), settings, { merge: true })
}
