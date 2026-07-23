import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { QueryWrapper } from '@/test/queryWrapper'
import { AuthContext } from '@/context/authContext'
import type { AuthState } from '@/context/authContext'

// Firebase-touching modules are mocked so rendering a lazy route never spins up
// the real SDK. We test the routing/Suspense wiring, not the pages' internals.
vi.mock('./firebase/orders', () => ({
  fetchOrders: vi.fn().mockResolvedValue([]),
  reconcileOrderNumbers: vi.fn().mockResolvedValue({ numbered: false, remaining: false }),
  waitForOrderWritesFlush: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./firebase/customers', () => ({ fetchCustomers: vi.fn().mockResolvedValue([]) }))
vi.mock('./firebase/auth', () => ({ signInWithGoogle: vi.fn(), signOutUser: vi.fn() }))

// Imported after the mocks above are registered. The app is a data router now
// (createBrowserRouter), so tests build a memory router from the SAME route
// config instead of wrapping <App/> in a MemoryRouter. Auth is injected above the
// router, exactly as the providers sit above RouterProvider in main.
import { routes } from './routes'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

function renderAt(path: string, auth: AuthState) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(
    <QueryWrapper>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryWrapper>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('App routing', () => {
  it('renders the login screen eagerly at "/"', () => {
    renderAt('/', { user: null, loading: false, sessionLost: false })
    // LoginPage is not lazy, so it is present on the first synchronous render.
    expect(screen.getByText('Войдите, чтобы управлять заказами')).toBeInTheDocument()
  })

  it('resolves the lazy orders route for a signed-in user', async () => {
    renderAt('/orders', { user: USER, loading: false, sessionLost: false })
    // The chunk loads asynchronously, so the page content appears after a tick.
    // The sidebar renders both layouts (desktop rail + mobile drawer duplicate the
    // nav), so scope to the desktop rail to match a single create-order link.
    // A generous timeout: this is the one test that waits for the real lazy
    // OrdersPage chunk to transform+resolve under vitest, which can exceed the
    // 1000ms default on a cold module graph (purely a test-env transform cost —
    // the prebuilt chunk loads instantly in the browser).
    const rail = await screen.findByTestId('sidebar-desktop', {}, { timeout: 5000 })
    expect(within(rail).getByRole('link', { name: 'Новый заказ' })).toHaveAttribute(
      'href',
      '/orders/new',
    )
  })

  it('redirects an unauthenticated visitor away from a protected route', async () => {
    renderAt('/orders', { user: null, loading: false, sessionLost: false })
    // ProtectedRoute sends signed-out users to the login screen.
    await waitFor(() =>
      expect(screen.getByText('Войдите, чтобы управлять заказами')).toBeInTheDocument(),
    )
  })

  it('shows the spinner (not a redirect) while the session is still resolving', () => {
    renderAt('/orders', { user: null, loading: true, sessionLost: false })
    // While auth is resolving, ProtectedRoute holds on the spinner instead of
    // redirecting — otherwise an already-signed-in user would flash the login
    // screen before the session restores.
    expect(screen.getByRole('status', { name: 'Загрузка' })).toBeInTheDocument()
    expect(screen.queryByText('Войдите, чтобы управлять заказами')).not.toBeInTheDocument()
  })
})
