import { describe, it, expect, afterEach, vi } from 'vitest'
import { compressImage } from './image'

const file = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('compressImage', () => {
  it('returns the original file when the canvas pipeline is unavailable (jsdom has no createImageBitmap)', async () => {
    // jsdom provides no createImageBitmap, so the guard short-circuits and the
    // upload still proceeds with the untouched file rather than failing.
    expect(typeof createImageBitmap).not.toBe('function')
    const f = file()
    expect(await compressImage(f)).toBe(f)
  })

  it('falls back to the original file if decoding throws', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('decode failed'))),
    )
    const f = file()
    expect(await compressImage(f)).toBe(f)
  })
})
