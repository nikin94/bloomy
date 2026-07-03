import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './client'
import { compressImage } from '@/utils/image'

// Order-photo storage layer. Photos live under
//   orders/{ownerId}/{orderId}/{photoId}.jpg
// so storage.rules can authorize purely from the path (uid == ownerId) without a
// Firestore lookup — the same owner-scoped boundary as the rest of the data. The
// order document stores these PATHS (see STORED_ORDER_SCHEMA.photos), not URLs.

const ORDERS_PREFIX = 'orders'

// Build the storage path for a photo. `photoId` is a random uuid (not the user's
// filename) so there are no collisions, unsafe characters, or PII in the path.
export const orderPhotoPath = (ownerId: string, orderId: string, photoId: string): string =>
  `${ORDERS_PREFIX}/${ownerId}/${orderId}/${photoId}.jpg`

// Compress the picked image and upload it under a fresh path; returns the stored
// PATH (to append to order.photos), not a URL. Needs a live connection — Storage
// has no offline write queue, so the caller surfaces a failure to the user.
export async function uploadOrderPhoto(
  ownerId: string,
  orderId: string,
  file: File,
): Promise<string> {
  const blob = await compressImage(file)
  const photoId = crypto.randomUUID()
  const path = orderPhotoPath(ownerId, orderId, photoId)
  await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' })
  return path
}

// Resolve a stored path to a temporary download URL. Cached in-memory for the
// session so re-rendering the gallery doesn't re-hit the network for the same
// photo (the URL itself carries a token and is stable for the session).
const urlCache = new Map<string, Promise<string>>()

export function getPhotoUrl(path: string): Promise<string> {
  let cached = urlCache.get(path)
  if (!cached) {
    cached = getDownloadURL(ref(storage, path)).catch((err: unknown) => {
      // Don't cache a failure — a transient error should be retryable on the
      // next render once the connection is back.
      urlCache.delete(path)
      throw err
    })
    urlCache.set(path, cached)
  }
  return cached
}

// Remove a photo's file from Storage. The caller also drops the path from
// order.photos; this clears the underlying bytes so they don't linger/cost.
export async function deleteOrderPhoto(path: string): Promise<void> {
  urlCache.delete(path)
  await deleteObject(ref(storage, path))
}
