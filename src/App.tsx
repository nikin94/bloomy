import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import Spinner from './components/Spinner/Spinner'
import UpdatePrompt from './components/UpdatePrompt/UpdatePrompt'
import LoginPage from './pages/LoginPage/LoginPage'
import { prefetchChunks } from './lib/prefetchChunks'
import './App.css'

// The owner-scoped screens are code-split with React.lazy so their JS (and the
// data layer + zod they pull in) loads only when the route is visited, not in
// the initial bundle. LoginPage stays eager — it is the first screen, so lazily
// loading it would only add a round-trip. Each lazy page becomes its own chunk.
//
// The import thunks are named so they feed BOTH lazy() (load on navigation) and
// the prefetch below (load ahead of time) from one source — the same specifier,
// so a prefetch warms the very chunk lazy() later resolves.
const loadOrders = () => import('./pages/OrdersPage/OrdersPage')
const loadNewOrder = () => import('./pages/NewOrderPage/NewOrderPage')
const loadOrderDetail = () => import('./pages/OrderDetailPage/OrderDetailPage')
const loadEditOrder = () => import('./pages/EditOrderPage/EditOrderPage')
const loadDeletedOrders = () => import('./pages/DeletedOrdersPage/DeletedOrdersPage')
const loadCustomers = () => import('./pages/CustomersPage/CustomersPage')

const ROUTE_LOADERS = [
  loadOrders,
  loadNewOrder,
  loadOrderDetail,
  loadEditOrder,
  loadDeletedOrders,
  loadCustomers,
]

const OrdersPage = lazy(loadOrders)
const NewOrderPage = lazy(loadNewOrder)
const OrderDetailPage = lazy(loadOrderDetail)
const EditOrderPage = lazy(loadEditOrder)
const DeletedOrdersPage = lazy(loadDeletedOrders)
const CustomersPage = lazy(loadCustomers)

function App() {
  // Prefetch every route chunk once the app is up, so navigating to a page the
  // user hasn't opened yet is instant — and, crucially, works OFFLINE: a chunk
  // fetched while online stays in the module registry, so React.lazy resolves it
  // with no network. Without this, an offline visit to an unvisited route hangs
  // on the Suspense spinner until its (unfetchable) chunk errors out. Runs on
  // idle so it never competes with the initial render, and retries on reconnect
  // (prefetchChunks is a no-op while offline).
  useEffect(() => {
    const run = () => prefetchChunks(ROUTE_LOADERS)
    const ric = typeof requestIdleCallback === 'function'
    const handle = ric ? requestIdleCallback(run) : window.setTimeout(run, 1000)
    window.addEventListener('online', run)
    return () => {
      if (ric) cancelIdleCallback(handle as number)
      else clearTimeout(handle as number)
      window.removeEventListener('online', run)
    }
  }, [])

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
