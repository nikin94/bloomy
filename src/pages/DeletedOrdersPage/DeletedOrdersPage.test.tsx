import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

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
// AppHeader imports signOutUser from here; stub it so firebase stays untouched.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

// Imported after the mocks above are registered.
import DeletedOrdersPage from './DeletedOrdersPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  number: 5,
  dateCreated: 1000,
  ownerId: 'owner-1',
  customerId: 'c1',
  address: 'Main St 1',
  plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 100000 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
  isDeleted: true,
  ...over,
})

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  ownerId: 'owner-1',
  name: 'Анна',
  createdAt: 0,
  ...over,
})

const renderPage = () =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <MemoryRouter>
        <DeletedOrdersPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

// The desktop table and mobile cards both render in jsdom; scope to one layout.
const table = () => within(screen.getByTestId('orders-table'))
// Search/filter actions render in both header layouts; scope to the desktop bar.
const header = () => within(screen.getByTestId('header-desktop'))

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
    await user.click(header().getByRole('button', { name: 'Поиск' }))
    await user.type(header().getByRole('textbox', { name: 'Поиск в корзине' }), 'Борис')

    expect(table().getByText('Борис')).toBeInTheDocument()
    expect(table().queryByText('Анна')).not.toBeInTheDocument()
  })

  it('filters the trash by shipment status from the filter dialog (same as the active list)', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([
      order({ id: 'o1', number: 5, customerId: 'c1', shipmentStatus: 'new' }),
      order({ id: 'o2', number: 6, customerId: 'c2', shipmentStatus: 'shipped' }),
    ])
    fetchCustomers.mockResolvedValue([
      customer({ id: 'c1', name: 'Анна' }),
      customer({ id: 'c2', name: 'Борис' }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(header().getByRole('button', { name: 'Фильтры' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус отправки' }), 'shipped')
    await user.click(screen.getByRole('button', { name: 'Готово' }))

    // Only the shipped order remains.
    expect(table().getByText('Борис')).toBeInTheDocument()
    expect(table().queryByText('Анна')).not.toBeInTheDocument()
  })

  it('shows a "nothing found" message when the search matches no trashed order', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5 })])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(header().getByRole('button', { name: 'Поиск' }))
    await user.type(header().getByRole('textbox', { name: 'Поиск в корзине' }), 'нет такого')

    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
  })
})
