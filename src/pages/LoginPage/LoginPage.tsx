import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/authContext'
import { registerWithEmail, signInWithEmail, signInWithGoogle } from '../../firebase/auth'
import { reportError } from '../../observability/reportError'
import Spinner from '../../components/Spinner/Spinner'
import Button from '../../components/Button/Button'
import Input from '../../components/Input/Input'

// Which action the email form performs: sign in to an existing account, or
// register a new one. A toggle below the form switches between the two.
type AuthMode = 'signin' | 'register'

// Map an auth failure (sign-in OR registration) to a message the user can act
// on. Firebase throws a FirebaseError carrying a string `code`; the raw
// code/message (e.g. "auth/network-request-failed") is meaningless to a user, so
// the common cases get a plain-Russian explanation. A network failure almost
// always means the auth servers are unreachable from this machine — an ad
// blocker, VPN, firewall or antivirus HTTPS inspection — not a problem with the
// app, so the message points there. Anything unrecognized falls back to a
// generic line that depends on which action failed.
const authErrorMessage = (err: unknown, mode: AuthMode): string => {
  const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined
  switch (code) {
    case 'auth/network-request-failed':
      return 'Не удалось связаться с сервером входа. Проверьте интернет, VPN, блокировщик рекламы или антивирус и попробуйте снова.'
    case 'auth/popup-blocked':
      return 'Браузер заблокировал окно входа. Разрешите всплывающие окна для этого сайта и попробуйте снова.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Окно входа закрылось до завершения. Попробуйте войти ещё раз.'
    // Sign-in failures: Firebase collapses wrong-email and wrong-password into
    // one code, so the message stays deliberately vague (no account
    // enumeration) — "почта или пароль неверны".
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Неверная почта или пароль.'
    case 'auth/invalid-email':
      return 'Неверный формат почты.'
    // Registration failures.
    case 'auth/email-already-in-use':
      return 'Этот адрес почты уже зарегистрирован. Войдите вместо регистрации.'
    case 'auth/weak-password':
      return 'Пароль слишком короткий — минимум 6 символов.'
    default:
      return mode === 'register'
        ? 'Не удалось зарегистрироваться. Попробуйте снова.'
        : 'Не удалось войти. Попробуйте снова.'
  }
}

const LoginPage = () => {
  const { user, loading, sessionLost } = useAuth()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<AuthMode>('signin')

  if (loading) return <Spinner />
  // Already signed in (or just signed in) → go straight to the orders list.
  if (user) return <Navigate to="/orders" replace />

  // Shared runner for every auth method: clears the prior error, flips the busy
  // flag, and on failure reports the raw FirebaseError to Sentry (so we see the
  // real `code` rather than guessing from screenshots) before showing the
  // friendly message. `context` distinguishes the paths in Sentry; `errorMode`
  // picks the right generic fallback (вход vs регистрация). On success
  // onAuthStateChanged flips `user`, which triggers the redirect above.
  const run = async (fn: () => Promise<unknown>, context: string, errorMode: AuthMode = 'signin') => {
    if (signingIn) return
    setError(null)
    setSigningIn(true)
    try {
      await fn()
    } catch (err: unknown) {
      reportError(err, context)
      setError(authErrorMessage(err, errorMode))
      setSigningIn(false)
    }
  }

  const handleSignIn = () => run(signInWithGoogle, 'signIn')

  // The email form does double duty: sign in to an existing account, or register
  // a new one, depending on the current mode.
  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (mode === 'register') {
      run(() => registerWithEmail(trimmed, password), 'registerEmail', 'register')
    } else {
      run(() => signInWithEmail(trimmed, password), 'signInEmail', 'signin')
    }
  }

  // Flip between sign-in and registration, clearing any stale error so the new
  // mode starts clean.
  const toggleMode = () => {
    setError(null)
    setMode((m) => (m === 'signin' ? 'register' : 'signin'))
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="m-0 text-4xl font-semibold text-heading">Bloomy</h1>
      <p className="m-0 text-text">Войдите, чтобы управлять заказами</p>

      {/* Session dropped unexpectedly (not a deliberate sign-out). We can't read
          the browser console on the user's machine, so we put a screenshottable
          explanation on screen: the likely cause AND the live connection state,
          which together confirm whether a blocked token refresh is to blame. */}
      {sessionLost && (
        <div
          role="alert"
          className="max-w-md rounded-lg border border-danger bg-danger-bg p-4 text-left text-sm text-text"
        >
          <p className="m-0 font-medium text-heading">Сессия прервалась</p>
          <p className="m-0 mt-1">
            Сессия завершилась автоматически. Чаще всего это значит, что VPN,
            блокировщик рекламы или антивирус блокирует серверы входа Google.
            Отключите их или смените сеть и войдите снова.
          </p>
          <p className="m-0 mt-2 text-text/80">
            Соединение: {navigator.onLine ? 'есть (онлайн)' : 'нет (офлайн)'}.
          </p>
        </div>
      )}

      <Button variant="primary" onClick={handleSignIn} isLoading={signingIn}>
        Войти через Google
      </Button>

      {/* Divider between the two sign-in methods. */}
      <div className="flex w-full max-w-xs items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-sm text-text">или</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Email/password — an alternative that skips the Google OAuth popup (which
          is blocked on the main user's machine). The same form signs in to an
          existing account or registers a new one, toggled below. */}
      <form onSubmit={handleEmailSubmit} className="flex w-full max-w-xs flex-col gap-3 text-left">
        <Input
          type="email"
          autoComplete="email"
          aria-label="Почта"
          placeholder="Почта"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          // A new account needs a fresh password; an existing one offers the
          // saved credential — hint the right autofill for each mode.
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          aria-label="Пароль"
          placeholder={mode === 'register' ? 'Пароль (минимум 6 символов)' : 'Пароль'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" variant="secondary" isLoading={signingIn}>
          {mode === 'register' ? 'Зарегистрироваться' : 'Войти по паролю'}
        </Button>
      </form>

      {/* Switch between sign-in and registration. */}
      <button
        type="button"
        onClick={toggleMode}
        className="text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {mode === 'register' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
      </button>

      {error && (
        <p role="alert" className="m-0 text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export default LoginPage
