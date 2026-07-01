import { describe, it, expect, vi } from 'vitest'
import { useMemo } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import { useHeaderActions } from '../../context/headerActionsContext'
import AppLayout from './AppLayout'

// AppHeader (rendered by the layout) pulls in the settings dialog, which imports
// signOutUser — stub it so the real Firebase SDK stays out of the test.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

// A routed page that publishes a marker control into the header slot (memoised,
// as the real pages do, so the node identity is stable across renders).
const PageWithActions = () => {
  const actions = useMemo(() => <button type="button">slot-action</button>, [])
  useHeaderActions(actions)
  return <Link to="/plain">go plain</Link>
}

// A routed page that publishes nothing.
const PlainPage = () => <p>plain page</p>

const renderAt = (path: string) =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/with" element={<PageWithActions />} />
            <Route path="/plain" element={<PlainPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )

// The header renders both layouts (desktop + mobile) in jsdom; the actions node
// appears in each, so scope assertions to the desktop bar.
const desktop = () => within(screen.getByTestId('header-desktop'))

describe('AppLayout', () => {
  it('renders the global header once, above the routed page', () => {
    renderAt('/plain')
    expect(screen.getByTestId('header-desktop')).toBeInTheDocument()
    expect(screen.getByText('plain page')).toBeInTheDocument()
  })

  it('publishes the mounted page’s header actions into the header slot', () => {
    renderAt('/with')
    expect(desktop().getByRole('button', { name: 'slot-action' })).toBeInTheDocument()
  })

  it('clears the actions when navigating to a page that publishes none', async () => {
    const user = userEvent.setup()
    renderAt('/with')
    expect(desktop().getByRole('button', { name: 'slot-action' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'go plain' }))

    expect(screen.getByText('plain page')).toBeInTheDocument()
    // The previous page unmounted, so its slot control is gone from the header.
    expect(desktop().queryByRole('button', { name: 'slot-action' })).not.toBeInTheDocument()
  })
})
