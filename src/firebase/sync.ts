import { waitForPendingWrites } from 'firebase/firestore'
import { db } from './client'

// Sync helper for the offline-capable data layer. Resolves once Firestore has
// acknowledged every write queued from THIS client — immediately when nothing is
// pending (a clean load), staying pending while a backlog is still flushing (just
// reconnected, or Firebase reachable again after a block). Wraps the raw SDK call
// + the `db` handle so components (the sync indicator) depend on this data-layer
// module instead of reaching past it into `firebase/firestore` and `./client` —
// the same boundary the fetch*/patch* functions keep.
export const awaitPendingWrites = (): Promise<void> => waitForPendingWrites(db)
