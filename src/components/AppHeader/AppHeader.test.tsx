import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'

// Stub the auth module so the sign-out button never touches the real Firebase SDK.
const signOutUser = vi.fn()
vi.mock('../../firebase/auth', () => ({ signOutUser: (...args: unknown[]) => signOutUser(...args) }))

// Imported after the mock above is registered.
import AppHeader from './AppHeader'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

const renderHeader = () =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false }}>
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

// The header renders both layouts (desktop inline + mobile menu) — jsdom has no
// media queries, so both are in the DOM. Scope queries to the right layout, as
// the mobile menu duplicates the same nav links and sign-out control.
const desktop = () => within(screen.getByTestId('header-desktop'))
const mobileMenu = () => within(screen.getByRole('navigation', { name: 'Меню' }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AppHeader (desktop)', () => {
  it('keeps the sign-out control accessible by name even though it is icon-only', () => {
    signOutUser.mockResolvedValue(undefined)
    renderHeader()
    // The button shows only an icon; the accessible name must survive via aria-label.
    expect(desktop().getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('signs out when the logout icon is clicked', async () => {
    signOutUser.mockResolvedValue(undefined)
    renderHeader()
    await userEvent.click(desktop().getByRole('button', { name: 'Выйти' }))
    expect(signOutUser).toHaveBeenCalledTimes(1)
  })

  it('exposes the create-order action as a link to the new-order form', () => {
    signOutUser.mockResolvedValue(undefined)
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
    expect(screen.getByRole('link', { name: 'Добавить заказ' })).toHaveAttribute(
      'href',
      '/orders/new',
    )
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

  it('signs out from the mobile menu', async () => {
    const user = userEvent.setup()
    signOutUser.mockResolvedValue(undefined)
    renderHeader()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    await user.click(mobileMenu().getByRole('button', { name: 'Выйти' }))
    expect(signOutUser).toHaveBeenCalledTimes(1)
  })
})
