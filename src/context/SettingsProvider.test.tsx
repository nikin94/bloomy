import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { AuthContext } from './authContext'
import { useSettings } from './settingsContext'

// Mock the data layer so the provider never touches the real Firestore SDK.
const fetchSettings = vi.fn()
const saveSettings = vi.fn()
vi.mock('../firebase/settings', () => ({
  fetchSettings: (...args: unknown[]) => fetchSettings(...args),
  saveSettings: (...args: unknown[]) => saveSettings(...args),
}))

// Imported after the mock above is registered.
import { SettingsProvider } from './SettingsProvider'

const USER = { uid: 'owner-1' } as User

// Reads the applied scale and offers a save trigger, so a test can observe the
// provider's state and the document side effect.
const Probe = () => {
  const { fontScale, saveFontScale } = useSettings()
  return <button onClick={() => saveFontScale(1.25)}>{`scale:${fontScale}`}</button>
}

const renderProvider = (user: User | null = USER) =>
  render(
    <AuthContext.Provider value={{ user, loading: false }}>
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    </AuthContext.Provider>,
  )

const cssScale = () => document.documentElement.style.getPropertyValue('--font-scale')

beforeEach(() => {
  vi.clearAllMocks()
  fetchSettings.mockResolvedValue({})
  saveSettings.mockResolvedValue(undefined)
  document.documentElement.style.removeProperty('--font-scale')
})

describe('SettingsProvider', () => {
  it('loads the saved font scale and applies it to the document', async () => {
    fetchSettings.mockResolvedValue({ fontScale: 1.25 })
    renderProvider()
    await waitFor(() => expect(fetchSettings).toHaveBeenCalledWith('owner-1'))
    await screen.findByText('scale:1.25')
    expect(cssScale()).toBe('1.25')
  })

  it('persists and applies a new scale on save', async () => {
    const user = userEvent.setup()
    renderProvider()
    await screen.findByText('scale:1')
    await user.click(screen.getByRole('button'))
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('owner-1', { fontScale: 1.25 }))
    await screen.findByText('scale:1.25')
    expect(cssScale()).toBe('1.25')
  })

  it('falls back to the default scale when signed out and never fetches', async () => {
    renderProvider(null)
    await screen.findByText('scale:1')
    expect(fetchSettings).not.toHaveBeenCalled()
    expect(cssScale()).toBe('1')
  })
})
