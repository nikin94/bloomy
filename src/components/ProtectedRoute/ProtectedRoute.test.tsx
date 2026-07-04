import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '@/context/authContext'
import type { AuthState } from '@/context/authContext'
import ProtectedRoute from './ProtectedRoute'

// ProtectedRoute is the owner-scoped route gate: it holds on a spinner while the
// session resolves, redirects a signed-out visitor to the login screen, and
// renders the nested route (its Outlet) for a signed-in user. Mounted under a
// real router with a public "/" route and a protected child, so the redirect and
// the Outlet both resolve exactly as in the app; auth is injected above the
// router the way the providers sit above RouterProvider in main.
const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

const renderAt = (auth: AuthState) => {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>Login screen</p> },
      {
        path: '/orders',
        element: <ProtectedRoute />,
        children: [{ index: true, element: <p>Protected content</p> }],
      },
    ],
    { initialEntries: ['/orders'] },
  )
  return render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
}

describe('ProtectedRoute', () => {
  it('holds on the spinner while the session is still resolving', () => {
    renderAt({ user: null, loading: true, sessionLost: false })
    // Loading MUST win over the signed-out redirect — otherwise an already-signed-in
    // user would flash the login screen before Firebase restores their session.
    expect(screen.getByRole('status', { name: 'Загрузка' })).toBeInTheDocument()
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('redirects a signed-out visitor to the login screen at "/"', () => {
    renderAt({ user: null, loading: false, sessionLost: false })
    expect(screen.getByText('Login screen')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('renders the nested route (Outlet) for a signed-in user', () => {
    renderAt({ user: USER, loading: false, sessionLost: false })
    expect(screen.getByText('Protected content')).toBeInTheDocument()
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument()
  })
})
