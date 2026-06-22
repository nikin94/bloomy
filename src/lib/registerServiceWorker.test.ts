import { describe, it, expect, vi, afterEach } from 'vitest'
import { registerServiceWorker } from './registerServiceWorker'

// import.meta.env.PROD is false under vitest, so registration must be a no-op
// here — the guard is exactly what keeps a SW out of dev/test (HMR-safe).
describe('registerServiceWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not register in a non-production build', () => {
    const register = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker: { register } })
    const addEventListener = vi.spyOn(window, 'addEventListener')

    registerServiceWorker()

    // Gated on import.meta.env.PROD (false in test) → nothing scheduled, nothing registered.
    expect(addEventListener).not.toHaveBeenCalledWith('load', expect.any(Function))
    expect(register).not.toHaveBeenCalled()
  })

  it('does not throw when the Service Worker API is unavailable', () => {
    vi.stubGlobal('navigator', {})
    expect(() => registerServiceWorker()).not.toThrow()
  })
})
