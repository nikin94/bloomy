// This is the app's route-config module, not a fast-refreshed component module:
// it deliberately defines route elements (the lazy pages + RootLayout) alongside
// the exported `routes` table, so react-refresh's "only export components" rule
// doesn't apply. Disabled file-wide rather than per lazy const.
/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute'
import AppLayout from '@/components/AppLayout/AppLayout'
import Spinner from '@/components/Spinner/Spinner'
import UpdatePrompt from '@/components/UpdatePrompt/UpdatePrompt'
import LoginPage from '@/pages/LoginPage/LoginPage'
import { prefetchChunks } from '@/lib/prefetchChunks'

// The owner-scoped screens are code-split with React.lazy so their JS (and the
// data layer + zod they pull in) loads only when the route is visited, not in
// the initial bundle. LoginPage stays eager — it is the first screen, so lazily
// loading it would only add a round-trip. Each lazy page becomes its own chunk.
//
// The import thunks are named so they feed BOTH lazy() (load on navigation) and
// the prefetch below (load ahead of time) from one source — the same specifier,
// so a prefetch warms the very chunk lazy() later resolves.
const loadOrders = () => import('@/pages/OrdersPage/OrdersPage')
const loadNewOrder = () => import('@/pages/NewOrderPage/NewOrderPage')
const loadOrderDetail = () => import('@/pages/OrderDetailPage/OrderDetailPage')
const loadEditOrder = () => import('@/pages/EditOrderPage/EditOrderPage')
const loadDeletedOrders = () => import('@/pages/DeletedOrdersPage/DeletedOrdersPage')
const loadCustomers = () => import('@/pages/CustomersPage/CustomersPage')
const loadCustomer = () => import('@/pages/CustomerPage/CustomerPage')
const loadStats = () => import('@/pages/StatsPage/StatsPage')
const loadSettings = () => import('@/pages/SettingsPage/SettingsPage')

const ROUTE_LOADERS = [
  loadOrders,
  loadNewOrder,
  loadOrderDetail,
  loadEditOrder,
  loadDeletedOrders,
  loadCustomers,
  loadCustomer,
  loadStats,
  loadSettings,
]

const OrdersPage = lazy(loadOrders)
const NewOrderPage = lazy(loadNewOrder)
const OrderDetailPage = lazy(loadOrderDetail)
const EditOrderPage = lazy(loadEditOrder)
const DeletedOrdersPage = lazy(loadDeletedOrders)
const CustomersPage = lazy(loadCustomers)
const CustomerPage = lazy(loadCustomer)
const StatsPage = lazy(loadStats)
const SettingsPage = lazy(loadSettings)

// Root layout element wrapping every route: the "new version available" banner
// (shows on any page), the Suspense boundary that holds while a lazy route chunk
// is fetched (reusing Spinner keeps the loading UX identical to data loading),
// and the chunk prefetch. Rendered once via the router's root route, around the
// matched page (<Outlet/>).
const RootLayout = () => {
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
    <Suspense fallback={<Spinner />}>
      <UpdatePrompt />
      <Outlet />
    </Suspense>
  )
}

// The app's route tree, exported so App builds the browser router from it and
// tests build a memory router from the SAME config (createMemoryRouter) instead
// of re-declaring the routes. A data router (createBrowserRouter) — rather than
// the declarative <BrowserRouter> — was originally adopted for the settings
// page's useBlocker leave-guard; settings autosave (#193) removed that guard,
// and the data router remains as the current API (useBlocker stays available
// to any future screen). The tree itself is unchanged from the old <Routes>
// version.
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      // Public login screen.
      { path: '/', element: <LoginPage /> },

      // Owner-scoped pages: require a signed-in user, then share the app shell
      // (global sidebar) via AppLayout so every page carries the nav.
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/orders', element: <OrdersPage /> },
              { path: '/orders/new', element: <NewOrderPage /> },
              // Static path declared before /orders/:id; React Router ranks it
              // above the dynamic segment regardless, but the order reads clearly.
              { path: '/orders/deleted', element: <DeletedOrdersPage /> },
              { path: '/orders/:id', element: <OrderDetailPage /> },
              { path: '/orders/:id/edit', element: <EditOrderPage /> },
              { path: '/customers', element: <CustomersPage /> },
              { path: '/customers/:id', element: <CustomerPage /> },
              { path: '/stats', element: <StatsPage /> },
              { path: '/settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
]
