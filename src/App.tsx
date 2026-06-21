import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import Spinner from './components/Spinner/Spinner'
import UpdatePrompt from './components/UpdatePrompt/UpdatePrompt'
import LoginPage from './pages/LoginPage/LoginPage'
import './App.css'

// The owner-scoped screens are code-split with React.lazy so their JS (and the
// data layer + zod they pull in) loads only when the route is visited, not in
// the initial bundle. LoginPage stays eager — it is the first screen, so lazily
// loading it would only add a round-trip. Each lazy page becomes its own chunk.
const OrdersPage = lazy(() => import('./pages/OrdersPage/OrdersPage'))
const NewOrderPage = lazy(() => import('./pages/NewOrderPage/NewOrderPage'))
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage/OrderDetailPage'))
const EditOrderPage = lazy(() => import('./pages/EditOrderPage/EditOrderPage'))
const DeletedOrdersPage = lazy(() => import('./pages/DeletedOrdersPage/DeletedOrdersPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage/CustomersPage'))

function App() {
  return (
    // Suspense fallback while a lazy route chunk is fetched. Reusing Spinner
    // keeps the loading UX identical to data loading (same centred overlay).
    <Suspense fallback={<Spinner />}>
      {/* Outside Routes: the "new version available" banner shows on any page. */}
      <UpdatePrompt />
      <Routes>
        {/* Public login screen. */}
        <Route path="/" element={<LoginPage />} />

        {/* Owner-scoped pages: require a signed-in user. */}
        <Route element={<ProtectedRoute />}>
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<NewOrderPage />} />
          {/* Static path declared before /orders/:id; React Router ranks it above
              the dynamic segment regardless, but the order reads clearly. */}
          <Route path="/orders/deleted" element={<DeletedOrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/orders/:id/edit" element={<EditOrderPage />} />
          <Route path="/customers" element={<CustomersPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
