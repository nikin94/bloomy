// Mock-based tests for the settings data layer. The Firebase SDK is stubbed, so
// these check OUR code: the per-user doc path, parsing, the missing-doc path,
// and the merge write.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { fetchSettings, saveSettings } from './settings'

vi.mock('./client', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ ref: 'settings-ref' })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchSettings', () => {
  it('returns the parsed settings when the document exists', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ fontScale: 1.25 }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    expect(await fetchSettings('owner-1')).toEqual({ fontScale: 1.25 })
    expect(doc).toHaveBeenCalledWith(expect.anything(), 'settings', 'owner-1')
  })

  it('returns an empty object when no settings are saved yet', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any)

    expect(await fetchSettings('owner-1')).toEqual({})
  })
})

describe('saveSettings', () => {
  it('merges the settings into the per-user document', async () => {
    await saveSettings('owner-1', { fontScale: 1.125 })

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'settings', 'owner-1')
    expect(setDoc).toHaveBeenCalledWith(
      { ref: 'settings-ref' },
      { fontScale: 1.125 },
      { merge: true },
    )
  })
})
