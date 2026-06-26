import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/authContext'
import { signInWithEmail, signInWithGoogle } from '../../firebase/auth'
import { reportError } from '../../observability/reportError'
import Spinner from '../../components/Spinner/Spinner'
import Button from '../../components/Button/Button'
import Input from '../../components/Input/Input'

// Map a sign-in failure to a message the user can act on. Firebase throws a
// FirebaseError carrying a string `code`; the raw code/message (e.g.
// "auth/network-request-failed") is meaningless to a user, so the common cases
// get a plain-Russian explanation. A network failure almost always means the
// auth servers are unreachable from this machine — an ad blocker, VPN, firewall
// or antivirus HTTPS inspection — not a problem with the app, so the message
// points there. Anything unrecognized falls back to a generic line.
const signInErrorMessage = (err: unknown): string => {
  const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined
  switch (code) {
    case 'auth/network-request-failed':
      return 'Не удалось связаться с сервером входа. Проверьте интернет, VPN, блокировщик рекламы или антивирус и попробуйте снова.'
    case 'auth/popup-blocked':
      return 'Браузер заблокировал окно входа. Разрешите всплывающие окна для этого сайта и попробуйте снова.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Окно входа закрылось до завершения. Попробуйте войти ещё раз.'
    // Email/password failures: Firebase collapses wrong-email and wrong-password
    // into one code, so the message stays deliberately vague (no account
    // enumeration) — "почта или пароль неверны".
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Неверная почта или пароль.'
    case 'auth/invalid-email':
      return 'Неверный формат почты.'
    default:
      return 'Не удалось войти. Попробуйте снова.'
  }
}

const LoginPage = () => {
  const { user, loading, sessionLost } = useAuth()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (loading) return <Spinner />
  // Already signed in (or just signed in) → go straight to the orders list.
  if (user) return <Navigate to="/orders" replace />

  // Shared runner for both sign-in methods: clears the prior error, flips the
  // busy flag, and on failure reports the raw FirebaseError to Sentry (so we see
  // the real `code` rather than guessing from screenshots) before showing the
  // friendly message. `context` distinguishes the two paths in Sentry. On success
  // onAuthStateChanged flips `user`, which triggers the redirect above.
  const run = async (fn: () => Promise<unknown>, context: string) => {
    if (signingIn) return
    setError(null)
    setSigningIn(true)
    try {
      await fn()
    } catch (err: unknown) {
      reportError(err, context)
      setError(signInErrorMessage(err))
      setSigningIn(false)
    }
  }

  const handleSignIn = () => run(signInWithGoogle, 'signIn')

  const handleEmailSignIn = (e: FormEvent) => {
    e.preventDefault()
    run(() => signInWithEmail(email.trim(), password), 'signInEmail')
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

      {/* Email/password sign-in — an alternative that skips the Google OAuth
          popup (which is blocked on the main user's machine). Accounts are
          created admin-side; there is no open sign-up here. */}
      <form onSubmit={handleEmailSignIn} className="flex w-full max-w-xs flex-col gap-3 text-left">
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
          autoComplete="current-password"
          aria-label="Пароль"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" variant="secondary" isLoading={signingIn}>
          Войти по паролю
        </Button>
      </form>

      {error && (
        <p role="alert" className="m-0 text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export default LoginPage
