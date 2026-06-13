import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/auth-context'

// Route guard for owner-scoped pages. Waits for the session to resolve, then
// sends signed-out visitors to the login screen at `/`.
function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) return <p className="p-6 text-text">Загрузка…</p>
  if (!user) return <Navigate to="/" replace />

  return <Outlet />
}

export default ProtectedRoute
