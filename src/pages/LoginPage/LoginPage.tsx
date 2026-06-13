import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'
import { signInWithGoogle } from '../../lib/auth'
import Spinner from '../../components/Spinner/Spinner'

function LoginPage() {
  const { user, loading } = useAuth()
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
      setError(err instanceof Error ? err.message : 'Не удалось войти')
      setSigningIn(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="m-0 text-4xl font-semibold text-heading">Bloomy</h1>
      <p className="m-0 text-text">Войдите, чтобы управлять заказами</p>
      <button
        type="button"
        onClick={handleSignIn}
        disabled={signingIn}
        className="rounded-md bg-accent px-6 py-2.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {signingIn ? 'Вход…' : 'Войти через Google'}
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
