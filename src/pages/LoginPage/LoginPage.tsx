import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/authContext'
import { signInWithGoogle } from '../../firebase/auth'
import { reportError } from '../../observability/reportError'
import Spinner from '../../components/Spinner/Spinner'
import Button from '../../components/Button/Button'

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
    default:
      return 'Не удалось войти. Попробуйте снова.'
  }
}

const LoginPage = () => {
  const { user, loading, sessionLost } = useAuth()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <Spinner />
  // Already signed in (or just signed in) → go straight to the orders list.
  if (user) return <Navigate to="/orders" replace />

  const handleSignIn = async () => {
    if (signingIn) return
    setError(null)
    setSigningIn(true)
    try {
      await signInWithGoogle()
      // onAuthStateChanged flips `user`, which triggers the redirect above.
    } catch (err: unknown) {
      // Report the raw failure to Sentry so we can see the real FirebaseError
      // `code` instead of guessing from screenshots — the friendly message below
      // collapses several codes (and the generic fallback) into one line, hiding
      // WHICH failure it was. The main user is in a sanctions-restricted region
      // where Google may reject the OAuth exchange itself, so the exact code is
      // what tells us whether it's a geo block vs a real bug.
      reportError(err, 'signIn')
      setError(signInErrorMessage(err))
      setSigningIn(false)
    }
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
      {error && (
        <p role="alert" className="m-0 text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export default LoginPage
