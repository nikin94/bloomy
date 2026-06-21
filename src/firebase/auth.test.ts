// Mock-based tests for the auth data layer. The Firebase SDK is stubbed, so
// these verify OUR logic in isolation — in particular the `intentionalSignOut`
// flag that lets AuthProvider tell a DELIBERATE sign-out apart from the session
// dropping out from under the user (a blocked token refresh).
//
// The flag's reset-on-failure behaviour is the offline-critical invariant: a
// sign-out is a LOCAL operation (clears persisted state, no network), so it
// works offline — but if it ever throws, the flag MUST be cleared again, or the
// NEXT genuine session drop would be misread as "intentional" and the login
// screen would stay silent instead of explaining what happened.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signOut, signInWithPopup } from 'firebase/auth'

vi.mock('./client', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  // A plain mock fn (not an arrow) so `new GoogleAuthProvider()` at module load
  // works — arrow functions can't be constructed.
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

// Imported after the mocks above are registered.
import {
  signInWithGoogle,
  signOutUser,
  wasSignOutIntentional,
  clearIntentionalSignOut,
} from './auth'

beforeEach(() => {
  vi.clearAllMocks()
  // Reset the module-level flag between tests via its public clearer.
  clearIntentionalSignOut()
})

describe('signOutUser', () => {
  it('marks the sign-out intentional and calls the SDK signOut', async () => {
    vi.mocked(signOut).mockResolvedValue(undefined)

    await signOutUser()

    expect(signOut).toHaveBeenCalledTimes(1)
    // The flag is armed so AuthProvider treats the coming auth-state change as
    // a deliberate sign-out (no "session lost" banner).
    expect(wasSignOutIntentional()).toBe(true)
  })

  it('resets the intentional flag and rethrows if signOut fails', async () => {
    vi.mocked(signOut).mockRejectedValue(new Error('offline'))

    await expect(signOutUser()).rejects.toThrow('offline')

    // The session is still live (no auth-state change fired), so the flag must
    // NOT stay armed — otherwise a later real session drop would be silently
    // swallowed as "intentional".
    expect(wasSignOutIntentional()).toBe(false)
  })
})

describe('intentional-sign-out flag', () => {
  it('defaults to false (an observed drop is unexpected until armed)', () => {
    expect(wasSignOutIntentional()).toBe(false)
  })

  it('is cleared by clearIntentionalSignOut after a successful sign-out', async () => {
    vi.mocked(signOut).mockResolvedValue(undefined)
    await signOutUser()
    expect(wasSignOutIntentional()).toBe(true)

    clearIntentionalSignOut()
    expect(wasSignOutIntentional()).toBe(false)
  })
})

describe('signInWithGoogle', () => {
  it('delegates to the SDK popup sign-in', () => {
    vi.mocked(signInWithPopup).mockResolvedValue({} as never)
    signInWithGoogle()
    expect(signInWithPopup).toHaveBeenCalledTimes(1)
  })
})
