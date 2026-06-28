import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

// Firebase-touching modules are mocked so the page never initializes the real
// SDK. We test the trash list rendering and the restore flow, not Firestore.
const fetchDeletedOrders = vi.fn()
const restoreOrder = vi.fn()
const fetchCustomers = vi.fn()

vi.mock('../../firebase/orders', () => ({
  fetchDeletedOrders: (...args: unknown[]) => fetchDeletedOrders(...args),
  restoreOrder: (...args: unknown[]) => restoreOrder(...args),
}))
vi.mock('../../firebase/customers', () => ({
  fetchCustomers: (...args: unknown[]) => fetchCustomers(...args),
}))
// AppHeader imports signOutUser from here; stub it so firebase stays untouched.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))

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

beforeEach(() => {
  vi.clearAllMocks()
  fetchDeletedOrders.mockResolvedValue([])
  fetchCustomers.mockResolvedValue([customer()])
  restoreOrder.mockResolvedValue(undefined)
})

describe('DeletedOrdersPage', () => {
  it('lists deleted orders with the resolved customer name', async () => {
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5, customerId: 'c1' })])
    renderPage()

    const item = await screen.findByRole('listitem')
    expect(within(item).getByText(/Заказ №5/)).toBeInTheDocument()
    // The customer name is resolved via the customers lookup, not stored on the order.
    expect(within(item).getByText(/Анна/)).toBeInTheDocument()
    // The trash fetch asks for the owner's deleted orders.
    expect(fetchDeletedOrders).toHaveBeenCalledWith('owner-1')
  })

  it('shows an empty state when the trash is empty', async () => {
    fetchDeletedOrders.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument()
  })

  it('restores an order after clicking Restore and drops it from the list', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5 })])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Восстановить' }))

    await waitFor(() => expect(restoreOrder).toHaveBeenCalledWith('o1'))
    // On success the row leaves the list; with no others left, the empty state shows.
    await waitFor(() => expect(screen.getByText('Корзина пуста')).toBeInTheDocument())
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
    await screen.findByText(/Заказ №5/)

    // The header renders both layouts (desktop + mobile) in jsdom, so scope the
    // search to the desktop bar to act on a single copy. It's collapsed behind a
    // loupe; click it to reveal the input.
    const header = within(screen.getByTestId('header-desktop'))
    await user.click(header.getByRole('button', { name: 'Поиск' }))
    await user.type(header.getByRole('textbox', { name: 'Поиск в корзине' }), 'Борис')

    expect(screen.getByText(/Заказ №6/)).toBeInTheDocument()
    expect(screen.queryByText(/Заказ №5/)).not.toBeInTheDocument()
  })

  it('shows a "nothing found" message when the search matches no trashed order', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5 })])
    renderPage()
    await screen.findByText(/Заказ №5/)

    const header = within(screen.getByTestId('header-desktop'))
    await user.click(header.getByRole('button', { name: 'Поиск' }))
    await user.type(header.getByRole('textbox', { name: 'Поиск в корзине' }), 'нет такого')

    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
    expect(screen.queryByText(/Заказ №5/)).not.toBeInTheDocument()
  })
})
