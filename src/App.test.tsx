import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from './context/auth-context'
import type { AuthState } from './context/auth-context'

// Firebase-touching modules are mocked so rendering a lazy route never spins up
// the real SDK. We test the routing/Suspense wiring, not the pages' internals.
vi.mock('./lib/orders', () => ({ fetchOrders: vi.fn().mockResolvedValue([]) }))
vi.mock('./lib/customers', () => ({ fetchCustomers: vi.fn().mockResolvedValue([]) }))
vi.mock('./lib/auth', () => ({ signInWithGoogle: vi.fn(), signOutUser: vi.fn() }))

// Imported after the mocks above are registered.
import App from './App'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

function renderAt(path: string, auth: AuthState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('App routing', () => {
  it('renders the login screen eagerly at "/"', () => {
    renderAt('/', { user: null, loading: false })
    // LoginPage is not lazy, so it is present on the first synchronous render.
    expect(screen.getByText('Войдите, чтобы управлять заказами')).toBeInTheDocument()
  })

  it('resolves the lazy orders route for a signed-in user', async () => {
    renderAt('/orders', { user: USER, loading: false })
    // The chunk loads asynchronously, so the page content appears after a tick.
    expect(await screen.findByRole('link', { name: 'Новый заказ' })).toBeInTheDocument()
  })

  it('redirects an unauthenticated visitor away from a protected route', async () => {
    renderAt('/orders', { user: null, loading: false })
    // ProtectedRoute sends signed-out users to the login screen.
    await waitFor(() =>
      expect(screen.getByText('Войдите, чтобы управлять заказами')).toBeInTheDocument(),
    )
  })
})
