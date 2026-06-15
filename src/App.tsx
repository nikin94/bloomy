import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import Spinner from './components/Spinner/Spinner'
import LoginPage from './pages/LoginPage/LoginPage'
import './App.css'

// The owner-scoped screens are code-split with React.lazy so their JS (and the
// data layer + zod they pull in) loads only when the route is visited, not in
// the initial bundle. LoginPage stays eager — it is the first screen, so lazily
// loading it would only add a round-trip. Each lazy page becomes its own chunk.
const OrdersPage = lazy(() => import('./pages/OrdersPage/OrdersPage'))
const NewOrderPage = lazy(() => import('./pages/NewOrderPage/NewOrderPage'))
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage/OrderDetailPage'))

function App() {
  return (
    // Suspense fallback while a lazy route chunk is fetched. Reusing Spinner
    // keeps the loading UX identical to data loading (same centred overlay).
    <Suspense fallback={<Spinner />}>
      <Routes>
        {/* Public login screen. */}
        <Route path="/" element={<LoginPage />} />

        {/* Owner-scoped pages: require a signed-in user. */}
        <Route element={<ProtectedRoute />}>
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<NewOrderPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
