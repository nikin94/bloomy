// Mock-based tests for the order-photo storage layer. The Storage SDK and the
// image compressor are stubbed, so these verify OUR logic: the owner-scoped
// path, the compress-then-upload flow, the URL cache, and cache invalidation on
// delete. The real owner boundary is exercised against the emulator in
// src/test/storage.rules.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { compressImage } from '@/utils/image'

vi.mock('./client', () => ({ storage: {} }))
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}))
vi.mock('../utils/image', () => ({ compressImage: vi.fn() }))

import { deleteOrderPhoto, getPhotoUrl, orderPhotoPath, uploadOrderPhoto } from './photos'

const file = new File(['x'], 'snap.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(compressImage).mockResolvedValue(file)
  vi.mocked(uploadBytes).mockResolvedValue({} as never)
  // Deterministic id so the path is assertable.
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' })
})

describe('orderPhotoPath', () => {
  it('scopes the path by owner then order then a uuid filename', () => {
    expect(orderPhotoPath('owner-1', 'o1', 'uuid-1')).toBe('orders/owner-1/o1/uuid-1.jpg')
  })
})

describe('uploadOrderPhoto', () => {
  it('compresses, uploads to the owner-scoped path, and returns that path', async () => {
    const path = await uploadOrderPhoto('owner-1', 'o1', file)

    expect(compressImage).toHaveBeenCalledWith(file)
    expect(path).toBe('orders/owner-1/o1/uuid-1.jpg')
    expect(ref).toHaveBeenCalledWith(expect.anything(), 'orders/owner-1/o1/uuid-1.jpg')
    expect(uploadBytes).toHaveBeenCalledWith({ path }, file, { contentType: 'image/jpeg' })
  })
})

describe('getPhotoUrl', () => {
  it('resolves a download URL and caches it (one network call for repeats)', async () => {
    vi.mocked(getDownloadURL).mockResolvedValue('https://cdn/x.jpg')

    expect(await getPhotoUrl('orders/owner-1/o1/uuid-1.jpg')).toBe('https://cdn/x.jpg')
    expect(await getPhotoUrl('orders/owner-1/o1/uuid-1.jpg')).toBe('https://cdn/x.jpg')
    expect(getDownloadURL).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure (it can be retried)', async () => {
    vi.mocked(getDownloadURL)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('https://cdn/y.jpg')

    await expect(getPhotoUrl('orders/owner-1/o1/retry.jpg')).rejects.toThrow('offline')
    expect(await getPhotoUrl('orders/owner-1/o1/retry.jpg')).toBe('https://cdn/y.jpg')
    expect(getDownloadURL).toHaveBeenCalledTimes(2)
  })
})

describe('deleteOrderPhoto', () => {
  it('deletes the object and invalidates the URL cache', async () => {
    vi.mocked(getDownloadURL).mockResolvedValue('https://cdn/z.jpg')
    vi.mocked(deleteObject).mockResolvedValue(undefined)
    const path = 'orders/owner-1/o1/del.jpg'

    await getPhotoUrl(path) // populate the cache
    await deleteOrderPhoto(path)
    expect(deleteObject).toHaveBeenCalledWith({ path })

    // After delete the cache is cleared, so a later resolve hits the network again.
    await getPhotoUrl(path)
    expect(getDownloadURL).toHaveBeenCalledTimes(2)
  })
})
