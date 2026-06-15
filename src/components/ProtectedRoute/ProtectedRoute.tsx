import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/authContext'
import Spinner from '../Spinner/Spinner'

// Route guard for owner-scoped pages. Waits for the session to resolve, then
// sends signed-out visitors to the login screen at `/`.
const ProtectedRoute = () => {
  const { user, loading } = useAuth()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/" replace />

  return <Outlet />
}

export default ProtectedRoute
