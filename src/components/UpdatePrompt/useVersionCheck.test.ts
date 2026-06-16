import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// The bundle's own version is read from this module; mock it so each test can
// pretend the app was built at a chosen version. A getter keeps the binding live
// so changing `mockVersion` between tests takes effect.
let mockVersion = 'v1'
vi.mock('../../version', () => ({
  get APP_VERSION() {
    return mockVersion
  },
}))

// Imported after the mock above is registered.
import { useVersionCheck } from './useVersionCheck'

const mockFetch = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) })

beforeEach(() => {
  mockVersion = 'v1'
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useVersionCheck', () => {
  it('reports an update when the deployed version differs from the bundle', async () => {
    vi.stubGlobal('fetch', mockFetch({ version: 'v2' }))
    const { result } = renderHook(() => useVersionCheck())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('stays false when the deployed version matches the bundle', async () => {
    const fetchSpy = mockFetch({ version: 'v1' })
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(() => useVersionCheck())
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(result.current).toBe(false)
  })

  it('does not poll at all for a local "dev" build', () => {
    mockVersion = 'dev'
    const fetchSpy = mockFetch({ version: 'whatever' })
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(() => useVersionCheck())
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.current).toBe(false)
  })

  it('ignores a failed version fetch (e.g. offline) and stays false', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(() => useVersionCheck())
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(result.current).toBe(false)
  })

  it('re-checks when the tab becomes visible again', async () => {
    const fetchSpy = mockFetch({ version: 'v1' })
    vi.stubGlobal('fetch', fetchSpy)
    renderHook(() => useVersionCheck())
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))

    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
  })
})
