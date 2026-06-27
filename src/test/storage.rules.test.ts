// Security-rules tests for storage.rules, run against the Storage emulator via
// @firebase/rules-unit-testing. These verify the SERVER-SIDE boundary for order
// photos: a signed-in user may only read/write/delete files under their own uid
// prefix, and writes must be images. Run with `yarn test:rules` (starts both the
// Firestore and Storage emulators).
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
// The rules under test, loaded as a raw string so the test feeds the exact same
// file that ships to production.
import storageRules from '../../storage.rules?raw'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let testEnv: RulesTestEnvironment

// Storage instances carrying an auth identity (or none). `alice`/`bob` are two
// tenants; `anon` is signed out.
const alice = () => testEnv.authenticatedContext('alice').storage()
const bob = () => testEnv.authenticatedContext('bob').storage()
const anon = () => testEnv.unauthenticatedContext().storage()

const bytes = new Uint8Array([1, 2, 3, 4])
const png = { contentType: 'image/png' }

// Seed a file bypassing rules, so read/delete tests start from an existing object
// owned by a specific tenant.
const seed = (path: string) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), bytes, png)
  })

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bloomy',
    storage: { rules: storageRules, host: '127.0.0.1', port: 9199 },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearStorage()
})

describe('order photo rules', () => {
  it('lets a user upload an image under their own uid prefix', async () => {
    await assertSucceeds(uploadBytes(ref(alice(), 'orders/alice/o1/p1.jpg'), bytes, png))
  })

  it('forbids uploading under another uid prefix', async () => {
    await assertFails(uploadBytes(ref(alice(), 'orders/bob/o1/p1.jpg'), bytes, png))
  })

  it('forbids an unauthenticated upload', async () => {
    await assertFails(uploadBytes(ref(anon(), 'orders/alice/o1/p1.jpg'), bytes, png))
  })

  it('forbids uploading a non-image file even under the own prefix', async () => {
    await assertFails(
      uploadBytes(ref(alice(), 'orders/alice/o1/doc.pdf'), bytes, { contentType: 'application/pdf' }),
    )
  })

  it('lets the owner read their photo but hides it from others', async () => {
    await seed('orders/alice/o1/p1.jpg')
    await assertSucceeds(getDownloadURL(ref(alice(), 'orders/alice/o1/p1.jpg')))
    await assertFails(getDownloadURL(ref(bob(), 'orders/alice/o1/p1.jpg')))
    await assertFails(getDownloadURL(ref(anon(), 'orders/alice/o1/p1.jpg')))
  })

  it('lets the owner delete their photo but not a foreign one', async () => {
    await seed('orders/alice/o1/p1.jpg')
    await assertFails(deleteObject(ref(bob(), 'orders/alice/o1/p1.jpg')))
    await assertSucceeds(deleteObject(ref(alice(), 'orders/alice/o1/p1.jpg')))
  })
})

describe('default deny', () => {
  it('blocks access to any path outside orders/, even when authenticated', async () => {
    await assertFails(uploadBytes(ref(alice(), 'secrets/s1.jpg'), bytes, png))
  })
})
