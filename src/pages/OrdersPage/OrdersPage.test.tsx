import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

// Firebase-touching modules are mocked so the page never initializes the real
// SDK. We test the filter behaviour (search + status) over an in-memory list.
const fetchOrders = vi.fn()
const fetchCustomers = vi.fn()

vi.mock('../../firebase/orders', () => ({ fetchOrders: (...a: unknown[]) => fetchOrders(...a) }))
vi.mock('../../firebase/customers', () => ({ fetchCustomers: (...a: unknown[]) => fetchCustomers(...a) }))
// AppHeader imports signOutUser from here; stub it so firebase stays untouched.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))

// Imported after the mocks above are registered.
import OrdersPage from './OrdersPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  number: 1,
  dateCreated: 1700000000000,
  ownerId: 'owner-1',
  customerId: 'c-anna',
  address: 'ул. Пушкина, 1',
  plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 1000 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
  ...over,
})

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c-anna',
  ownerId: 'owner-1',
  name: 'Анна',
  createdAt: 0,
  ...over,
})

const renderPage = () =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false }}>
      <MemoryRouter>
        <OrdersPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

// The desktop table and mobile cards both render in jsdom; scope to one layout.
const table = () => within(screen.getByTestId('orders-table'))

beforeEach(() => {
  vi.clearAllMocks()
  fetchCustomers.mockResolvedValue([
    customer({ id: 'c-anna', name: 'Анна' }),
    customer({ id: 'c-boris', name: 'Борис' }),
  ])
  fetchOrders.mockResolvedValue([
    order({ id: 'o1', number: 1, customerId: 'c-anna', shipmentStatus: 'new' }),
    order({ id: 'o2', number: 2, customerId: 'c-boris', shipmentStatus: 'shipped' }),
  ])
})

describe('OrdersPage filtering', () => {
  it('narrows the list to orders matching the search query (by customer name)', async () => {
    const user = userEvent.setup()
    renderPage()
    // Wait for the async load, then both orders are listed.
    await screen.findByTestId('orders-table')
    expect(table().getByText('Анна')).toBeInTheDocument()
    expect(table().getByText('Борис')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Поиск заказов' }), 'Борис')

    expect(table().queryByText('Анна')).not.toBeInTheDocument()
    expect(table().getByText('Борис')).toBeInTheDocument()
  })

  it('filters by shipment status, chosen in the filter dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('orders-table')

    // The status filters live behind the filter icon, not inline.
    expect(screen.queryByRole('combobox', { name: 'Фильтр по статусу отправки' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Фильтры' }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Фильтр по статусу отправки' }),
      'shipped',
    )
    // Close the dialog to see the filtered list.
    await user.click(screen.getByRole('button', { name: 'Готово' }))

    // Only the shipped order (Борис) remains.
    expect(table().getByText('Борис')).toBeInTheDocument()
    expect(table().queryByText('Анна')).not.toBeInTheDocument()
  })

  it('resets the status filters from the dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(screen.getByRole('button', { name: 'Фильтры' }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Фильтр по статусу отправки' }),
      'shipped',
    )
    await user.click(screen.getByRole('button', { name: 'Сбросить' }))
    await user.click(screen.getByRole('button', { name: 'Готово' }))

    // Both orders are back once the status filter is cleared.
    expect(table().getByText('Анна')).toBeInTheDocument()
    expect(table().getByText('Борис')).toBeInTheDocument()
  })

  it('shows a price range slider spanning 0…ceiling when orders differ in price', async () => {
    const user = userEvent.setup()
    fetchOrders.mockResolvedValue([
      order({ id: 'o1', plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 100000 }] }), // 1000 ₽
      order({ id: 'o2', plants: [{ name: 'Пион', quantity: 1, unitPriceMinor: 500000 }] }), // 5000 ₽ — ceiling
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(screen.getByRole('button', { name: 'Фильтры' }))
    // The range renders as a single track with a "from"/"to" thumb pair; the
    // summary shows the full span until the user narrows it. (The actual drag is
    // pointer-geometry driven and lives in the library — the price-filtering
    // logic itself is covered by filterOrders' unit tests.)
    expect(screen.getByText('Сумма заказа')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Минимальная сумма' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Максимальная сумма' })).toBeInTheDocument()
  })

  it('hides the price slider when there is no range to pick (all totals zero)', async () => {
    const user = userEvent.setup()
    fetchOrders.mockResolvedValue([
      order({ id: 'o1', plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 0 }], deliveryPriceMinor: 0 }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(screen.getByRole('button', { name: 'Фильтры' }))
    // The ceiling is 0, so the price section is omitted — the status filters
    // remain.
    expect(screen.queryByText('Сумма заказа')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Фильтр по статусу оплаты' })).toBeInTheDocument()
  })

  it('shows a "nothing found" message when the filter matches no orders', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('orders-table')

    await user.type(screen.getByRole('searchbox', { name: 'Поиск заказов' }), 'нет такого')

    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
    expect(screen.queryByTestId('orders-table')).not.toBeInTheDocument()
  })
})
