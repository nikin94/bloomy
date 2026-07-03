import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '@/context/authContext'

// Stub the auth module so signing in never touches the real Firebase SDK. Each
// test controls what the sign-in fns resolve/reject with to exercise the flow.
const signInWithGoogle = vi.fn()
const signInWithEmail = vi.fn()
const registerWithEmail = vi.fn()
const sendPasswordReset = vi.fn()
vi.mock('../../firebase/auth', () => ({
  signInWithGoogle: (...args: unknown[]) => signInWithGoogle(...args),
  signInWithEmail: (...args: unknown[]) => signInWithEmail(...args),
  registerWithEmail: (...args: unknown[]) => registerWithEmail(...args),
  sendPasswordReset: (...args: unknown[]) => sendPasswordReset(...args),
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

  it('signs in with the entered email and password', async () => {
    const user = userEvent.setup()
    signInWithEmail.mockResolvedValue({})
    renderLogin()

    await user.type(screen.getByLabelText('Почта'), '  user@example.com  ')
    await user.type(screen.getByLabelText('Пароль'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    // The email is trimmed before it reaches the SDK; the password is sent as-is.
    await waitFor(() => expect(signInWithEmail).toHaveBeenCalledWith('user@example.com', 'secret'))
  })

  it('shows one vague message for bad credentials (no account enumeration)', async () => {
    const user = userEvent.setup()
    signInWithEmail.mockRejectedValue(authError('auth/invalid-credential'))
    renderLogin()

    await user.type(screen.getByLabelText('Почта'), 'user@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Неверная почта или пароль.')
    // The raw failure still reaches Sentry under its own context.
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ code: 'auth/invalid-credential' }), 'signInEmail')
  })

  it('registers a new account with the entered email and password after toggling to sign-up', async () => {
    const user = userEvent.setup()
    registerWithEmail.mockResolvedValue({})
    renderLogin()

    // Switch from the default sign-in mode to registration.
    await user.click(screen.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }))

    await user.type(screen.getByLabelText('Почта'), '  new@example.com  ')
    await user.type(screen.getByLabelText('Пароль'), 'secret123')
    await user.type(screen.getByLabelText('Подтверждение пароля'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    // Registers via the SDK (not sign-in), with the email trimmed.
    await waitFor(() => expect(registerWithEmail).toHaveBeenCalledWith('new@example.com', 'secret123'))
    expect(signInWithEmail).not.toHaveBeenCalled()
  })

  it('on a taken email, registration auto-sends a set-password email to that same account', async () => {
    const user = userEvent.setup()
    // The account exists but has no password (e.g. created via Google), so
    // creation fails — registration then falls back to a set-password email.
    registerWithEmail.mockRejectedValue(authError('auth/email-already-in-use'))
    sendPasswordReset.mockResolvedValue(undefined)
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }))
    await user.type(screen.getByLabelText('Почта'), '  taken@example.com  ')
    await user.type(screen.getByLabelText('Пароль'), 'secret123')
    await user.type(screen.getByLabelText('Подтверждение пароля'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    // The one button resolves the Google-only-account case by emailing a
    // set-password link to that address (trimmed).
    await waitFor(() => expect(sendPasswordReset).toHaveBeenCalledWith('taken@example.com'))
    // A positive confirmation (status, not error) explains what to do next.
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/уже зарегистрирован/i)
    expect(status).toHaveTextContent(/установки пароля отправлено/i)
    // This is an expected branch, not a bug → NOT reported as a register failure.
    expect(reportError).not.toHaveBeenCalled()
  })

  it('explains a too-short password on registration', async () => {
    const user = userEvent.setup()
    registerWithEmail.mockRejectedValue(authError('auth/weak-password'))
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }))
    await user.type(screen.getByLabelText('Почта'), 'new@example.com')
    await user.type(screen.getByLabelText('Пароль'), '123')
    await user.type(screen.getByLabelText('Подтверждение пароля'), '123')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/минимум 6 символов/i)
  })

  it('blocks registration when the confirmation does not match (no SDK call)', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }))
    await user.type(screen.getByLabelText('Почта'), 'new@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'secret123')
    await user.type(screen.getByLabelText('Подтверждение пароля'), 'secret124')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    // A client-side mismatch is caught before any network call.
    expect(await screen.findByRole('alert')).toHaveTextContent('Пароли не совпадают.')
    expect(registerWithEmail).not.toHaveBeenCalled()
  })

  it('keeps the email but clears the passwords when switching sign-in/registration', async () => {
    const user = userEvent.setup()
    renderLogin()

    // Type into the sign-in form, reveal the password, then switch to register.
    await user.type(screen.getByLabelText('Почта'), 'someone@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Показать пароль' }))
    await user.click(screen.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }))

    // The email carries over (no needless retyping); the password clears and
    // re-masks, and the fresh confirmation field is blank.
    expect(screen.getByLabelText('Почта')).toHaveValue('someone@example.com')
    const password = screen.getByLabelText('Пароль')
    expect(password).toHaveValue('')
    expect(password).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Подтверждение пароля')).toHaveValue('')

    // Fill the register passwords, then switch back — email stays, passwords clear.
    await user.type(screen.getByLabelText('Пароль'), 'fresh123')
    await user.click(screen.getByRole('button', { name: 'Уже есть аккаунт? Войти' }))

    expect(screen.getByLabelText('Почта')).toHaveValue('someone@example.com')
    expect(screen.getByLabelText('Пароль')).toHaveValue('')
  })

  it('reveals and re-hides the password via the eye toggle', async () => {
    const user = userEvent.setup()
    renderLogin()

    const password = screen.getByLabelText('Пароль')
    // Masked by default.
    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Показать пароль' }))
    expect(password).toHaveAttribute('type', 'text')

    // The toggle flips its accessible name; clicking again re-masks.
    await user.click(screen.getByRole('button', { name: 'Скрыть пароль' }))
    expect(password).toHaveAttribute('type', 'password')
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
