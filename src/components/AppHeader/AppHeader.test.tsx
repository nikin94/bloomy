import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'

// Stub the auth module: the settings dialog (rendered by the header) imports
// signOutUser, so keep the real Firebase SDK out of the test.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))

// Imported after the mock above is registered.
import AppHeader from './AppHeader'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

// Surfaces the current route so a navigation (e.g. the mobile back button) is
// assertable without a full page tree.
const LocationProbe = () => <div data-testid="pathname">{useLocation().pathname}</div>

// Defaults to a top-level route (`/orders`), so the header sits where it has no
// back control; pass an inner path to exercise the back button.
const renderHeader = (initialPath = '/orders') =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppHeader />
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

// The header renders both layouts (desktop inline + mobile menu) — jsdom has no
// media queries, so both are in the DOM. Scope queries to the right layout, as
// the mobile menu duplicates the same nav links and settings control.
const desktop = () => within(screen.getByTestId('header-desktop'))
const mobileMenu = () => within(screen.getByRole('navigation', { name: 'Меню' }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AppHeader (desktop)', () => {
  it('exposes the settings control accessible by name even though it is icon-only', () => {
    renderHeader()
    // The button shows only a gear icon; the accessible name survives via aria-label.
    expect(desktop().getByRole('button', { name: 'Настройки' })).toBeInTheDocument()
  })

  it('opens the settings dialog from the gear', async () => {
    renderHeader()
    // The dialog (which now holds sign-out) is closed until the gear is clicked.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(desktop().getByRole('button', { name: 'Настройки' }))
    expect(screen.getByRole('dialog', { name: 'Настройки' })).toBeInTheDocument()
  })

  it('exposes the create-order action as a link to the new-order form', () => {
    renderHeader()
    // "Новый заказ" is styled as a primary action but stays a navigation link.
    expect(desktop().getByRole('link', { name: 'Новый заказ' })).toHaveAttribute(
      'href',
      '/orders/new',
    )
  })
})

describe('AppHeader (mobile menu)', () => {
  it('starts collapsed and toggles open from the burger', async () => {
    const user = userEvent.setup()
    renderHeader()
    const burger = screen.getByRole('button', { name: 'Открыть меню' })
    expect(burger).toHaveAttribute('aria-expanded', 'false')

    await user.click(burger)
    // The toggle flips to a close affordance and reports the expanded state.
    expect(screen.getByRole('button', { name: 'Закрыть меню' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    // The menu's destinations are now reachable.
    expect(mobileMenu().getByRole('link', { name: 'Клиенты' })).toHaveAttribute(
      'href',
      '/customers',
    )
  })

  it('reveals the create-order action on the open-menu header line', async () => {
    const user = userEvent.setup()
    renderHeader()
    // The action is hidden until the menu opens.
    expect(screen.queryByRole('link', { name: 'Добавить заказ' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    // "Добавить заказ" appears in the bar row (alongside the close toggle), not
    // inside the nav list; "Заказы" stays a plain destination link in the menu.
    const createLink = screen.getByRole('link', { name: 'Добавить заказ' })
    expect(createLink).toHaveAttribute('href', '/orders/new')
    // Single-line (whitespace-nowrap) so it can't wrap to two lines and grow the
    // mobile bar taller than the closed state — that growth is the content jump.
    expect(createLink).toHaveClass('whitespace-nowrap')
    expect(mobileMenu().getByRole('link', { name: 'Заказы' })).toHaveAttribute('href', '/orders')
  })

  it('closes after a menu destination is chosen', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    await user.click(mobileMenu().getByRole('link', { name: 'Клиенты' }))
    // Selecting a link collapses the menu, so the burger shows "open" again.
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('opens the settings dialog from the menu gear', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    await user.click(mobileMenu().getByRole('button', { name: 'Настройки' }))
    expect(screen.getByRole('dialog', { name: 'Настройки' })).toBeInTheDocument()
  })
})

describe('AppHeader mobile back button', () => {
  it('shows no back button on a top-level nav destination', () => {
    renderHeader('/orders')
    expect(screen.queryByRole('button', { name: 'Назад' })).not.toBeInTheDocument()
  })

  it('shows no back button on the trash (also a top-level destination)', () => {
    renderHeader('/orders/deleted')
    expect(screen.queryByRole('button', { name: 'Назад' })).not.toBeInTheDocument()
  })

  it('returns an order detail up to the orders list', async () => {
    const user = userEvent.setup()
    renderHeader('/orders/abc123')
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    // Anchored: substring 'toHaveTextContent' would also match an inner path.
    expect(screen.getByTestId('pathname')).toHaveTextContent(/^\/orders$/)
  })

  it('returns a customer page up to the customers list', async () => {
    const user = userEvent.setup()
    renderHeader('/customers/c1')
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByTestId('pathname')).toHaveTextContent(/^\/customers$/)
  })

  it('returns the edit form up to its order detail (one level, not the list)', async () => {
    const user = userEvent.setup()
    renderHeader('/orders/abc123/edit')
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByTestId('pathname')).toHaveTextContent(/^\/orders\/abc123$/)
  })

  it('hides the back button while the mobile menu is open (create action takes the row)', async () => {
    const user = userEvent.setup()
    renderHeader('/orders/abc123')
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(screen.queryByRole('button', { name: 'Назад' })).not.toBeInTheDocument()
  })
})
