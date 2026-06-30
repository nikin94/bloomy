# Bloomy Cloud Functions

A single Cloud Function, **`cleanupOrderPhotos`**, that deletes an order's photo
folder from Cloud Storage when its Firestore document is deleted.

This is the server half of the **trash auto-purge** feature (backlog #4). The
client half (`deletedAt` / `purgeAt` + the "удалится через N дней" countdown)
shipped in PR #109. Here:

- A **Firestore TTL policy** on the `orders` collection, keyed on the `purgeAt`
  field, hard-deletes a trashed order's **document** ~24h after it expires
  (30 days after it was moved to the trash).
- TTL deletes documents only — it never touches Cloud Storage. So this function
  listens for `onDocumentDeleted('orders/{orderId}')` and sweeps the order's
  photos at `orders/{ownerId}/{orderId}/`, keeping zero orphaned blobs.

The trigger also fires for any other hard delete (e.g. the admin reset tool), so
those clean up their photos too. An order that never had photos is a no-op.

> **Migration note (#6):** if/when the backend moves off Google (PocketBase),
> this function and the TTL policy are thrown away and replaced by the new
> backend's own retention mechanism. Keep it minimal.

---

## Local development

```bash
cd functions
npm install
npm run build      # tsc → lib/
npm run serve      # build + Functions emulator
```

## Deploy (OWNER-ONLY — needs the project's Blaze billing + credentials)

The CI hosting deploy (`action-hosting-deploy@v0`) is **hosting only** and never
touches functions, so the function is deployed manually:

```bash
firebase deploy --only functions
```

(`predeploy` compiles `functions/src` → `functions/lib` automatically.)

## Enable the TTL policy (OWNER-ONLY, one time)

The function only removes photos; the **document** purge is done by Firestore's
native TTL. Turn it on once, either in the console or via gcloud:

- **Console:** Firestore → your database → **Time-to-live (TTL)** → *Create
  policy* → collection group `orders`, timestamp field `purgeAt`.
- **gcloud:**
  ```bash
  gcloud firestore fields ttls update purgeAt \
    --collection-group=orders --enable-ttl --project=bloomy-b69df
  ```

Documents whose `purgeAt` is in the past become eligible and are deleted within
~24h. Orders written by PR #109 already carry `purgeAt`, so no backfill is needed.

> **Clock-skew note (reviewer, PR #109):** `purgeAt` is stamped with the client's
> `Date.now()` at soft-delete time, so a skewed client clock shifts the purge
> moment. On a **30-day** window this is immaterial (even an hour's skew is
> ~0.14%), so it is accepted rather than corrected with an extra always-firing
> trigger. If exact server-authoritative timing is ever needed, add a write
> trigger that re-stamps `purgeAt` from the event time.
