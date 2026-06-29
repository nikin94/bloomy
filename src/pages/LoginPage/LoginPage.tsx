import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/authContext'
import {
  registerWithEmail,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
} from '../../firebase/auth'
import { reportError } from '../../observability/reportError'
import Spinner from '../../components/Spinner/Spinner'
import Button from '../../components/Button/Button'
import Input from '../../components/Input/Input'

// Which action the email form performs: sign in to an existing account, or
// register a new one. A toggle below the form switches between the two.
type AuthMode = 'signin' | 'register'

// Show/hide-password icon: a plain eye when the password is masked (click to
// reveal), a struck-through eye when it's visible (click to hide). Drawn from
// `currentColor` so it inherits the button's text colour in both themes.
const EyeIcon = ({ crossed }: { crossed: boolean }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-5"
  >
    {crossed ? (
      <>
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" x2="22" y1="2" y2="22" />
      </>
    ) : (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
)

// Map an auth failure (sign-in OR registration) to a message the user can act
// on. Firebase throws a FirebaseError carrying a string `code`; the raw
// code/message (e.g. "auth/network-request-failed") is meaningless to a user, so
// the common cases get a plain-Russian explanation. A network failure almost
// always means the auth servers are unreachable from this machine — an ad
// blocker, VPN, firewall or antivirus HTTPS inspection — not a problem with the
// app, so the message points there. Anything unrecognized falls back to a
// generic line that depends on which action failed.
const authErrorMessage = (t: TFunction<'auth'>, err: unknown, mode: AuthMode): string => {
  const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined
  switch (code) {
    case 'auth/network-request-failed':
      return t('errors.network')
    case 'auth/popup-blocked':
      return t('errors.popupBlocked')
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return t('errors.popupClosed')
    // Sign-in failures: Firebase collapses wrong-email and wrong-password into
    // one code, so the message stays deliberately vague (no account
    // enumeration) — "почта или пароль неверны".
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return t('errors.invalidCredential')
    case 'auth/invalid-email':
      return t('errors.invalidEmail')
    // Registration failure: too-short password. A taken address is NOT mapped
    // here — registration intercepts `email-already-in-use` itself and falls
    // back to sending a set-password email (see handleRegister).
    case 'auth/weak-password':
      return t('errors.weakPassword')
    default:
      return mode === 'register' ? t('errors.registerFailed') : t('errors.signInFailed')
  }
}

const LoginPage = () => {
  const { t } = useTranslation('auth')
  const { user, loading, sessionLost } = useAuth()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A success message (not an error) — e.g. "set-password email sent". Kept
  // separate from `error` so it renders in a neutral/positive style.
  const [notice, setNotice] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Confirmation field, shown only when registering — guards against a typo in a
  // brand-new password the user can't see by default.
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    setNotice(null)
    setSigningIn(true)
    try {
      await fn()
    } catch (err: unknown) {
      reportError(err, context)
      setError(authErrorMessage(t, err, errorMode))
      setSigningIn(false)
    }
  }

  const handleSignIn = () => run(signInWithGoogle, 'signIn')

  // Registration adapts to the account's actual state, so the one button covers
  // both cases the user can be in:
  //  • brand-new email → create the account and sign the user straight in
  //    (onAuthStateChanged then redirects).
  //  • email already exists but has no password — typically an account created
  //    via Google sign-in — so createUserWithEmailAndPassword fails with
  //    `email-already-in-use`. Instead of a dead end, send a "set password"
  //    email that adds a password to that SAME account (the user keeps all their
  //    data), then tell them to open it (a phone works if this machine blocks
  //    Google domains) and sign in with the new password.
  const handleRegister = async (trimmed: string) => {
    if (signingIn) return
    setError(null)
    setNotice(null)
    setSigningIn(true)
    try {
      await registerWithEmail(trimmed, password)
      // Success → keep the button busy until the auth-state redirect fires.
      return
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined
      if (code === 'auth/email-already-in-use') {
        // Existing (password-less) account → set a password on it rather than
        // failing. Not a bug, so not reported to Sentry under the register path.
        try {
          await sendPasswordReset(trimmed)
          setNotice(t('setPasswordSent', { email: trimmed }))
        } catch (resetErr: unknown) {
          reportError(resetErr, 'registerSetPassword')
          setError(authErrorMessage(t, resetErr, 'signin'))
        }
      } else {
        reportError(err, 'registerEmail')
        setError(authErrorMessage(t, err, 'register'))
      }
    }
    setSigningIn(false)
  }

  // The email form does double duty: sign in to an existing account, or register
  // a new one, depending on the current mode.
  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (mode === 'register') {
      // Catch a mistyped confirmation before hitting the network — a client-side
      // check, so no Sentry report.
      if (password !== confirmPassword) {
        setNotice(null)
        setError(t('passwordMismatch'))
        return
      }
      void handleRegister(trimmed)
    } else {
      run(() => signInWithEmail(trimmed, password), 'signInEmail', 'signin')
    }
  }

  // Flip between sign-in and registration. KEEP the email (the common path is
  // "tried to sign in → no account → switch to register"; retyping the address
  // is needless friction), but clear the passwords + confirmation and re-mask —
  // a register password should never linger into a sign-in attempt, and a
  // revealed-password state shouldn't carry into the fresh form. Clear any stale
  // error/notice so the new mode starts clean.
  const toggleMode = () => {
    setError(null)
    setNotice(null)
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setMode((m) => (m === 'signin' ? 'register' : 'signin'))
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="m-0 text-4xl font-semibold text-heading">Bloomy</h1>
      <p className="m-0 text-text">{t('tagline')}</p>

      {/* Session dropped unexpectedly (not a deliberate sign-out). We can't read
          the browser console on the user's machine, so we put a screenshottable
          explanation on screen: the likely cause AND the live connection state,
          which together confirm whether a blocked token refresh is to blame. */}
      {sessionLost && (
        <div
          role="alert"
          className="max-w-md rounded-lg border border-danger bg-danger-bg p-4 text-left text-sm text-text"
        >
          <p className="m-0 font-medium text-heading">{t('sessionLostTitle')}</p>
          <p className="m-0 mt-1">{t('sessionLostBody')}</p>
          <p className="m-0 mt-2 text-text/80">
            {t('connection', { state: navigator.onLine ? t('online') : t('offline') })}
          </p>
        </div>
      )}

      <Button variant="primary" onClick={handleSignIn} isLoading={signingIn}>
        {t('googleSignIn')}
      </Button>

      {/* Divider between the two sign-in methods. */}
      <div className="flex w-full max-w-xs items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-sm text-text">{t('or')}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Email/password — an alternative that skips the Google OAuth popup (which
          is blocked on the main user's machine). The same form signs in to an
          existing account or registers a new one, toggled below. */}
      <form onSubmit={handleEmailSubmit} className="flex w-full max-w-xs flex-col gap-3 text-left">
        <Input
          type="email"
          autoComplete="email"
          label={t('email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          // Reveal/mask is controlled by the eye toggle in the suffix below.
          type={showPassword ? 'text' : 'password'}
          // A new account needs a fresh password; an existing one offers the
          // saved credential — hint the right autofill for each mode.
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          label={t('password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          suffix={
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              aria-pressed={showPassword}
              className="flex items-center rounded p-1 text-text hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <EyeIcon crossed={showPassword} />
            </button>
          }
        />
        {/* Confirmation — registration only. Shares the eye toggle's reveal state
            so both password fields show/hide together. */}
        {mode === 'register' && (
          <Input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            label={t('confirmPassword')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        )}
        <Button type="submit" variant="secondary" isLoading={signingIn}>
          {mode === 'register' ? t('register') : t('signIn')}
        </Button>
      </form>

      {/* Switch between sign-in and registration. Registration itself handles
          the "account exists but has no password" case (sends a set-password
          email), so no separate reset button is needed. */}
      <button
        type="button"
        onClick={toggleMode}
        className="text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {mode === 'register' ? t('toSignIn') : t('toRegister')}
      </button>

      {error && (
        <p role="alert" className="m-0 max-w-xs text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="m-0 max-w-xs text-accent">
          {notice}
        </p>
      )}
    </div>
  )
}

export default LoginPage
