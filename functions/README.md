# Bloomy Cloud Functions

A single Cloud Function, **`cleanupOrderPhotos`**, that deletes an order's photo
folder from Cloud Storage when its Firestore document is deleted.

Firestore deletes documents only — nothing server-side ever touches Cloud
Storage. So this function listens for `onDocumentDeleted('orders/{orderId}')`
and sweeps the order's photos at `orders/{ownerId}/{orderId}/`, keeping zero
orphaned blobs. It fires for **any** hard delete of an order document:

- the trash page's **"Очистить корзину"** (batched hard deletes — the one way an
  order permanently leaves the app since PR #193 made the trash manual-only);
- the **admin reset** tool.

An order that never had photos is a no-op.

> **History — do NOT re-create a TTL policy.** This function originally shipped
> as the server half of a trash auto-purge (PR #109): a Firestore TTL policy on
> `orders.purgeAt` hard-deleted trashed documents ~30 days after deletion, and
> this function swept their photos. PR #193 removed the auto-purge (owner
> decision: emptying the trash is a deliberate action, never a background one),
> and the TTL policy was deleted server-side on 2026-07-19. A `purgeAt` field
> lingering on an old trashed document is inert and must stay that way — with
> no policy, nothing reads it. The function itself is purge-mechanism-agnostic
> (it keys off document deletion, not off who deleted it), so it survived the
> feature change unchanged.

> **Migration note (#6):** if/when the backend moves off Google (PocketBase),
> this function is thrown away and replaced by the new backend's own cleanup.
> Keep it minimal.

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
