import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { initializeApp } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

// The Admin SDK is initialized once per instance from the function's ambient
// service-account credentials (no config needed when deployed).
initializeApp()

// Storage prefix that holds an order's photos: `orders/{ownerId}/{orderId}/`.
// The client photo feature was removed, but this cleanup stays so a deleted
// order still sweeps any LEGACY photos left under this prefix in Storage.
const orderPhotoPrefix = (ownerId: string, orderId: string): string =>
  `orders/${ownerId}/${orderId}/`

// When an order document is deleted, sweep its photo folder from Cloud Storage.
//
// This is the one piece that needs a server: a document delete never touches
// Cloud Storage, so without this an order's photos would linger forever as
// orphans. Every hard delete fires `onDocumentDeleted` — the trash page's
// "empty trash" (hardDeleteOrders) and the admin reset tool — and this trigger
// deletes every object under `orders/{ownerId}/{orderId}/`. (The Firestore TTL
// policy over `purgeAt` that used to auto-purge the trash was removed by owner
// decision — trashed orders now stay until deleted by hand — but this function
// stays: it is what makes any hard delete photo-clean.)
//
// The deleted document's data is still available on the event, so `ownerId` is read
// from it (the path only carries `orderId`). Deleting a non-existent/empty prefix is
// a no-op, so an order that never had photos costs nothing and never errors.
export const cleanupOrderPhotos = onDocumentDeleted('orders/{orderId}', async (event) => {
  const orderId = event.params.orderId
  const data = event.data?.data()
  const ownerId = typeof data?.ownerId === 'string' ? data.ownerId : undefined

  // No ownerId means we can't form the owner-scoped prefix; deleting by orderId
  // alone would be unsafe (it isn't unique across owners in the path), so skip.
  if (!ownerId) {
    logger.warn(`cleanupOrderPhotos: order ${orderId} deleted without an ownerId; skipping photo cleanup`)
    return
  }

  const prefix = orderPhotoPrefix(ownerId, orderId)
  try {
    await getStorage().bucket().deleteFiles({ prefix })
    logger.info(`cleanupOrderPhotos: removed Storage objects under ${prefix}`)
  } catch (err) {
    // Surface the failure in the function logs; the document is already gone, so
    // there's nothing to roll back. A failed sweep just leaves orphan bytes, which
    // a later manual cleanup (or a re-run) can mop up.
    logger.error(`cleanupOrderPhotos: failed to delete objects under ${prefix}`, err)
    throw err
  }
})
