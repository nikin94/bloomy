import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { QueryWrapper } from '@/test/queryWrapper'
import { AuthContext } from '@/context/authContext'
import AppLayout from '@/components/AppLayout/AppLayout'
import type { Order } from '@/types/order'
import { order as baseOrder, customer } from '@/test/factories'

// Firebase-touching modules are mocked so the page never initializes the real
// SDK. We test the trash list rendering (same DataTable as the active list), the
// search/filter, and that a row opens the order's detail page (where Restore now
// lives) — not Firestore.
const fetchDeletedOrders = vi.fn()
const fetchCustomers = vi.fn()
const navigate = vi.fn()

vi.mock('../../firebase/orders', () => ({
  fetchDeletedOrders: (...args: unknown[]) => fetchDeletedOrders(...args),
}))
vi.mock('../../firebase/customers', () => ({
  fetchCustomers: (...args: unknown[]) => fetchCustomers(...args),
}))
// Sidebar imports signOutUser from here; stub it so firebase stays untouched.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

// Imported after the mocks above are registered.
import DeletedOrdersPage from './DeletedOrdersPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

// Same observable defaults as before consolidation: a trashed order №5 with a
// latin address (the canonical Роза×1 line and zero delivery are reused as-is).
const order = (over: Partial<Order> = {}): Order =>
  baseOrder({
    number: 5,
    dateCreated: 1000,
    address: 'Main St 1',
    isDeleted: true,
    ...over,
  })

// The header now lives in AppLayout (above the page in the route tree), and the
// page publishes its search + filter controls into it via the header-actions
// slot — so the page is mounted inside AppLayout here, as in the app, for the
// header and its actions to render.
const renderPage = () =>
  render(
    <QueryWrapper>
      <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="*" element={<DeletedOrdersPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryWrapper>,
  )

// The desktop table and mobile cards both render in jsdom; scope to one layout.
const table = () => within(screen.getByTestId('orders-table'))
// Search/filter actions render in both header layouts; scope to the desktop bar.
const header = () => within(screen.getByTestId('sidebar-desktop'))

beforeEach(() => {
  vi.clearAllMocks()
  fetchDeletedOrders.mockResolvedValue([])
  fetchCustomers.mockResolvedValue([customer()])
})

describe('DeletedOrdersPage', () => {
  it('lists deleted orders in the same table layout, with the resolved name', async () => {
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5, customerId: 'c1' })])
    renderPage()

    await screen.findByTestId('orders-table')
    // The customer name is resolved via the customers lookup, not stored on the order.
    expect(table().getByText('Анна')).toBeInTheDocument()
    expect(table().getByText('5')).toBeInTheDocument()
    // The trash fetch asks for the owner's deleted orders.
    expect(fetchDeletedOrders).toHaveBeenCalledWith('owner-1')
  })

  it('shows a per-order auto-purge countdown column', async () => {
    // Just deleted → the full 30-day retention window remains.
    fetchDeletedOrders.mockResolvedValue([
      order({ id: 'o1', number: 5, customerId: 'c1', deletedAt: Date.now() }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    expect(table().getByText('Удаление')).toBeInTheDocument() // the column header
    expect(table().getByText('30 дней')).toBeInTheDocument() // days left in the window
  })

  it('shows a fixed "these are deleted" banner when the trash has orders', async () => {
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5 })])
    renderPage()
    await screen.findByTestId('orders-table')
    expect(screen.getByText(/Корзина — эти заказы удалены/)).toBeInTheDocument()
  })

  it('shows an empty state (and no banner) when the trash is empty', async () => {
    fetchDeletedOrders.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument()
    // No deleted orders → the page-label banner is not shown.
    expect(screen.queryByText(/Корзина — эти заказы удалены/)).not.toBeInTheDocument()
  })

  it('opens the order detail page when a trash row is clicked', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5, customerId: 'c1' })])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(table().getAllByRole('link')[0])
    expect(navigate).toHaveBeenCalledWith('/orders/o1')
  })

  it('narrows the trash to orders matching the search (by number or customer)', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([
      order({ id: 'o1', number: 5, customerId: 'c1' }),
      order({ id: 'o2', number: 6, customerId: 'c2' }),
    ])
    fetchCustomers.mockResolvedValue([
      customer({ id: 'c1', name: 'Анна' }),
      customer({ id: 'c2', name: 'Борис' }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    // The search box is collapsed behind a loupe; click it to reveal the input.
    await user.click(await header().findByRole('button', { name: 'Поиск' }))
    await user.type(header().getByRole('textbox', { name: 'Поиск в корзине' }), 'Борис')

    expect(table().getByText('Борис')).toBeInTheDocument()
    expect(table().queryByText('Анна')).not.toBeInTheDocument()
  })

  it('filters the trash by order status from the filter dialog (same as the active list)', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([
      order({ id: 'o1', number: 5, customerId: 'c1', shipmentStatus: 'processing' }),
      order({ id: 'o2', number: 6, customerId: 'c2', shipmentStatus: 'delivered' }),
    ])
    fetchCustomers.mockResolvedValue([
      customer({ id: 'c1', name: 'Анна' }),
      customer({ id: 'c2', name: 'Борис' }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(await header().findByRole('button', { name: 'Фильтры' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус заказа' }), 'delivered')
    await user.click(screen.getByRole('button', { name: 'Готово' }))

    // Only the delivered order remains.
    expect(table().getByText('Борис')).toBeInTheDocument()
    expect(table().queryByText('Анна')).not.toBeInTheDocument()
  })

  it('shows a "nothing found" message when the search matches no trashed order', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5 })])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(await header().findByRole('button', { name: 'Поиск' }))
    await user.type(header().getByRole('textbox', { name: 'Поиск в корзине' }), 'нет такого')

    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
  })
})
