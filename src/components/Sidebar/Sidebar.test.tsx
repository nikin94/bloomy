import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'

// Stub the auth module: the settings dialog (opened from the sidebar) imports
// signOutUser, so keep the real Firebase SDK out of the test.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))

// Imported after the mock above is registered.
import Sidebar from './Sidebar'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

// Renders the current pathname so the back button's route-parent navigation is
// observable without mocking the router.
const LocationProbe = () => {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname}</div>
}

const renderSidebar = (path = '/orders') =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

// The sidebar renders BOTH the desktop rail and the mobile drawer — jsdom has no
// media queries, so both are in the DOM. Scope queries to the right layout, since
// the drawer duplicates the same nav destinations and settings control.
const rail = () => within(screen.getByTestId('sidebar-desktop'))
const drawer = () => within(screen.getByTestId('mobile-drawer'))
const burger = () => screen.getByRole('button', { name: 'Открыть меню' })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Sidebar (desktop rail)', () => {
  it('exposes the settings control by name in the button list', () => {
    renderSidebar()
    expect(rail().getByRole('button', { name: 'Настройки' })).toBeInTheDocument()
  })

  it('opens the settings dialog from the settings button', async () => {
    const user = userEvent.setup()
    renderSidebar()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(rail().getByRole('button', { name: 'Настройки' }))
    expect(screen.getByRole('dialog', { name: 'Настройки' })).toBeInTheDocument()
  })

  it('links the primary create action and the nav destinations', () => {
    renderSidebar()
    expect(rail().getByRole('link', { name: 'Новый заказ' })).toHaveAttribute('href', '/orders/new')
    expect(rail().getByRole('link', { name: 'Клиенты' })).toHaveAttribute('href', '/customers')
    expect(rail().getByRole('link', { name: 'Статистика' })).toHaveAttribute('href', '/stats')
  })

  it('keeps the create link on one line (no wrap growing the row)', () => {
    renderSidebar()
    expect(rail().getByRole('link', { name: 'Новый заказ' })).toHaveClass('whitespace-nowrap')
  })
})

describe('Sidebar (mobile drawer)', () => {
  it('toggles the drawer open and closed from the burger', async () => {
    const user = userEvent.setup()
    renderSidebar()
    expect(burger()).toHaveAttribute('aria-expanded', 'false')
    await user.click(burger())
    expect(screen.getByRole('button', { name: 'Закрыть меню' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('holds the create action, destinations, and settings in the drawer', () => {
    renderSidebar()
    expect(drawer().getByRole('link', { name: 'Добавить заказ' })).toHaveAttribute(
      'href',
      '/orders/new',
    )
    expect(drawer().getByRole('link', { name: 'Заказы' })).toHaveAttribute('href', '/orders')
    expect(drawer().getByRole('button', { name: 'Настройки' })).toBeInTheDocument()
  })

  it('closes the drawer after a destination is chosen', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(burger())
    await user.click(drawer().getByRole('link', { name: 'Клиенты' }))
    // The pick collapses the drawer, so the burger reads "open" again.
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('closes the drawer on Escape', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(burger())
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})

describe('Sidebar (mobile back button)', () => {
  it('shows a back control on an inner page and returns UP the route hierarchy', async () => {
    const user = userEvent.setup()
    renderSidebar('/customers/c1')
    expect(screen.getByTestId('loc')).toHaveTextContent('/customers/c1')
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    // Route parent, not history — /customers/c1 → /customers.
    expect(screen.getByTestId('loc')).toHaveTextContent(/^\/customers$/)
  })

  it('shows no back control on a top-level destination', () => {
    renderSidebar('/orders')
    expect(screen.queryByRole('button', { name: 'Назад' })).not.toBeInTheDocument()
  })
})
