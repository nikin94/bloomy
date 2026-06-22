import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../../context/authContext'

// Stub the auth module so signing in never touches the real Firebase SDK. Each
// test controls what signInWithGoogle rejects with to exercise the error mapping.
const signInWithGoogle = vi.fn()
vi.mock('../../firebase/auth', () => ({
  signInWithGoogle: (...args: unknown[]) => signInWithGoogle(...args),
}))
// Spy on the telemetry helper so a test can assert the raw failure is reported.
const reportError = vi.fn()
vi.mock('../../observability/reportError', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}))

// Imported after the mock above is registered.
import LoginPage from './LoginPage'

// A FirebaseError-like rejection: an Error subclass carrying a string `code`.
const authError = (code: string) => Object.assign(new Error(code), { code })

const renderLogin = (sessionLost = false) =>
  render(
    <AuthContext.Provider value={{ user: null, loading: false, sessionLost }}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoginPage', () => {
  it('explains a network failure in actionable terms instead of the raw code', async () => {
    const user = userEvent.setup()
    signInWithGoogle.mockRejectedValue(authError('auth/network-request-failed'))
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Войти через Google' }))

    const alert = await screen.findByRole('alert')
    // The friendly message, not the raw "auth/network-request-failed".
    expect(alert).toHaveTextContent(/сервером входа/i)
    expect(alert).not.toHaveTextContent('auth/network-request-failed')
  })

  it('falls back to a generic message for an unrecognized error', async () => {
    const user = userEvent.setup()
    signInWithGoogle.mockRejectedValue(authError('auth/internal-error'))
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Войти через Google' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось войти. Попробуйте снова.')
  })

  it('reports the raw failure to Sentry so the real code is visible, not just the friendly text', async () => {
    const user = userEvent.setup()
    const err = authError('auth/internal-error')
    signInWithGoogle.mockRejectedValue(err)
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Войти через Google' }))

    await screen.findByRole('alert')
    expect(reportError).toHaveBeenCalledWith(err, 'signIn')
  })

  it('re-enables the button after a failure so the user can retry', async () => {
    const user = userEvent.setup()
    signInWithGoogle.mockRejectedValue(authError('auth/network-request-failed'))
    renderLogin()

    const button = screen.getByRole('button', { name: 'Войти через Google' })
    await user.click(button)

    await screen.findByRole('alert')
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('explains an unexpected session drop so the user can screenshot the cause', () => {
    renderLogin(true)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Сессия прервалась')
    // Points at the likely cause (env, not the app) for an actionable screenshot.
    expect(alert).toHaveTextContent(/VPN|блокировщик|антивирус/i)
  })

  it('shows no session-lost banner on a normal visit', () => {
    renderLogin(false)
    expect(screen.queryByText('Сессия прервалась')).not.toBeInTheDocument()
  })
})
