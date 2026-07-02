import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'

// Stub the auth module: the settings screen (reached from the sidebar) imports
// signOutUser, so keep the real Firebase SDK out of the test.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))

// Imported after the mock above is registered.
import Sidebar from './Sidebar'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

// Renders the current pathname + search so both the back button's route-parent
// navigation and the settings section links (/settings?section=…) are observable
// without mocking the router.
const LocationProbe = () => {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname}{loc.search}</div>
}

const renderSidebar = (path = '/orders', actions?: ReactNode) =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar actions={actions} />
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
  it('toggles the settings section flyout; sections link to /settings?section=…', async () => {
    const user = userEvent.setup()
    renderSidebar()
    // Stage 3: settings is a TOGGLE (not a link) — it reveals the section flyout;
    // navigation onto the settings screen happens only when a section is picked.
    const toggle = rail().getByRole('button', { name: 'Настройки' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const flyout = within(screen.getByTestId('settings-flyout'))
    expect(flyout.getByRole('link', { name: 'Внешний вид' })).toHaveAttribute(
      'href',
      '/settings?section=appearance',
    )
    expect(flyout.getByRole('link', { name: 'Заказы' })).toHaveAttribute(
      'href',
      '/settings?section=orders',
    )
  })

  it('navigates to the settings screen only when a section is picked', async () => {
    const user = userEvent.setup()
    renderSidebar()
    // Opening the flyout does not leave the current page…
    await user.click(rail().getByRole('button', { name: 'Настройки' }))
    expect(screen.getByTestId('loc')).toHaveTextContent(/^\/orders$/)
    // …picking a section does.
    await user.click(within(screen.getByTestId('settings-flyout')).getByRole('link', { name: 'Заказы' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/settings?section=orders')
  })

  it('opens the flyout and marks the active section when already on /settings', () => {
    renderSidebar('/settings?section=orders')
    expect(rail().getByRole('button', { name: 'Настройки' })).toHaveAttribute('aria-expanded', 'true')
    const flyout = within(screen.getByTestId('settings-flyout'))
    expect(flyout.getByRole('link', { name: 'Заказы' })).toHaveAttribute('aria-current', 'page')
    expect(flyout.getByRole('link', { name: 'Внешний вид' })).not.toHaveAttribute('aria-current')
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

  it('renders published page actions in the rail (and mirrors them in the mobile bar)', () => {
    renderSidebar('/orders', <div data-testid="page-actions">search</div>)
    // Present in the desktop rail's per-page controls slot...
    expect(rail().getByTestId('page-actions')).toBeInTheDocument()
    // ...and mirrored in the mobile top bar, so both layouts get the controls.
    expect(screen.getAllByTestId('page-actions')).toHaveLength(2)
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

  it('holds the create action, destinations, and a settings accordion in the drawer', async () => {
    const user = userEvent.setup()
    renderSidebar()
    expect(drawer().getByRole('link', { name: 'Добавить заказ' })).toHaveAttribute(
      'href',
      '/orders/new',
    )
    // Assert a destination whose name doesn't collide with a settings section
    // ("Клиенты" — vs "Заказы", which is both a destination and a section).
    expect(drawer().getByRole('link', { name: 'Клиенты' })).toHaveAttribute('href', '/customers')
    // Settings is a toggle expanding the section list; a section links to /settings?section=…
    const settingsToggle = drawer().getByRole('button', { name: 'Настройки' })
    expect(settingsToggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(settingsToggle)
    expect(settingsToggle).toHaveAttribute('aria-expanded', 'true')
    expect(drawer().getByRole('link', { name: 'Внешний вид' })).toHaveAttribute(
      'href',
      '/settings?section=appearance',
    )
  })

  it('closes the drawer when a settings section is picked', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(burger())
    await user.click(drawer().getByRole('button', { name: 'Настройки' }))
    await user.click(drawer().getByRole('link', { name: 'Внешний вид' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/settings?section=appearance')
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
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

describe('Sidebar (mobile top bar title)', () => {
  it('names the current destination on a top-level page', () => {
    renderSidebar('/orders')
    expect(screen.getByRole('heading', { name: 'Заказы' })).toBeInTheDocument()
  })

  it('names the active settings section on the settings screen', () => {
    renderSidebar('/settings?section=orders')
    expect(screen.getByRole('heading', { name: 'Заказы' })).toBeInTheDocument()
  })

  it('shows no bar title on an inner page (the page keeps its own heading)', () => {
    // Sidebar renders no heading here; the inner page supplies its own in-content h1.
    renderSidebar('/orders/o1')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
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
