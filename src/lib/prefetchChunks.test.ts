import { describe, it, expect, vi, afterEach } from 'vitest'
import { prefetchChunks } from './prefetchChunks'

// navigator.onLine is a getter in jsdom; redefine it per test, restore after.
const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

afterEach(() => {
  setOnline(true)
})

describe('prefetchChunks', () => {
  it('invokes every loader when online', () => {
    setOnline(true)
    const a = vi.fn().mockResolvedValue(undefined)
    const b = vi.fn().mockResolvedValue(undefined)

    prefetchChunks([a, b])

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('invokes no loader while offline (the import would only fail)', () => {
    setOnline(false)
    const load = vi.fn().mockResolvedValue(undefined)

    prefetchChunks([load])

    expect(load).not.toHaveBeenCalled()
  })

  it('swallows a failing loader so one bad chunk cannot break the others', async () => {
    setOnline(true)
    const failing = vi.fn().mockRejectedValue(new Error('offline'))
    const ok = vi.fn().mockResolvedValue(undefined)

    // Must not throw synchronously…
    expect(() => prefetchChunks([failing, ok])).not.toThrow()
    // …and the rejection must not surface as an unhandled rejection.
    await Promise.resolve()
    expect(failing).toHaveBeenCalledTimes(1)
    expect(ok).toHaveBeenCalledTimes(1)
  })
})
