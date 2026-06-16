import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import type { User } from 'firebase/auth'

// Capture the observer callback Firebase would call, so the test can drive
// sign-in / sign-out transitions by hand.
const onAuthStateChanged = vi.fn()
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChanged(...args),
}))
vi.mock('../firebase/client', () => ({ auth: {} }))

// Control the intentional-sign-out flag the provider reads to tell a deliberate
// sign-out apart from the session dropping unexpectedly.
let intentional = false
vi.mock('../firebase/auth', () => ({
  wasSignOutIntentional: () => intentional,
  clearIntentionalSignOut: () => {
    intentional = false
  },
}))

// Imported after the mocks above are registered.
import { AuthProvider } from './AuthProvider'
import { useAuth } from './authContext'

const USER = { uid: 'owner-1' } as User

// Surfaces the auth state so a test can read uid + sessionLost from the DOM.
const Probe = () => {
  const { user, sessionLost } = useAuth()
  return <span>{`uid:${user?.uid ?? 'none'} lost:${sessionLost}`}</span>
}

// Renders the provider and returns the captured onAuthStateChanged callback, so
// the test can emit auth transitions through it.
const renderProvider = () => {
  let cb: (user: User | null) => void = () => {}
  onAuthStateChanged.mockImplementation((_auth: unknown, fn: (user: User | null) => void) => {
    cb = fn
    return () => {}
  })
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  return (next: User | null) => act(() => cb(next))
}

beforeEach(() => {
  vi.clearAllMocks()
  intentional = false
})

describe('AuthProvider session-loss detection', () => {
  it('flags sessionLost when a signed-in user drops to null unexpectedly', () => {
    const emit = renderProvider()
    emit(USER)
    expect(screen.getByText('uid:owner-1 lost:false')).toBeInTheDocument()

    // No signOutUser was called, so the drop is unexpected (e.g. a blocked token refresh).
    emit(null)
    expect(screen.getByText('uid:none lost:true')).toBeInTheDocument()
  })

  it('does not flag a deliberate sign-out', () => {
    const emit = renderProvider()
    emit(USER)
    intentional = true // signOutUser would have set this
    emit(null)
    expect(screen.getByText('uid:none lost:false')).toBeInTheDocument()
  })

  it('does not flag the first-load signed-out state (never had a session)', () => {
    const emit = renderProvider()
    emit(null)
    expect(screen.getByText('uid:none lost:false')).toBeInTheDocument()
  })

  it('clears the flag when the user signs back in', () => {
    const emit = renderProvider()
    emit(USER)
    emit(null)
    expect(screen.getByText('uid:none lost:true')).toBeInTheDocument()
    emit(USER)
    expect(screen.getByText('uid:owner-1 lost:false')).toBeInTheDocument()
  })
})
