import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'
import { signInWithGoogle } from '../../lib/auth'
import Spinner from '../../components/Spinner/Spinner'
import Button from '../../components/Button/Button'

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
      <Button variant="primary" onClick={handleSignIn} disabled={signingIn}>
        {signingIn ? 'Вход…' : 'Войти через Google'}
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
