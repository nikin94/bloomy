import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

// Firebase-touching modules are mocked so the page never initializes the real
// SDK. We test the page render and the inline status save flow, not Firestore.
const fetchOrder = vi.fn()
const updateOrder = vi.fn()
const fetchCustomer = vi.fn()

vi.mock('../../firebase/orders', () => ({
  fetchOrder: (...args: unknown[]) => fetchOrder(...args),
  updateOrder: (...args: unknown[]) => updateOrder(...args),
}))
vi.mock('../../firebase/customers', () => ({
  fetchCustomer: (...args: unknown[]) => fetchCustomer(...args),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ id: 'o1' }),
}))

// Imported after the mocks above are registered.
import OrderDetailPage from './OrderDetailPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  number: 5,
  dateCreated: 1000,
  ownerId: 'owner-1',
  customerId: 'c1',
  address: 'Main St 1',
  plants: [{ name: 'Роза', quantity: 2, unitPriceMinor: 14990 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 30000,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
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
    <AuthContext.Provider value={{ user: USER, loading: false }}>
      <MemoryRouter>
        <OrderDetailPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  fetchOrder.mockResolvedValue(order())
  fetchCustomer.mockResolvedValue(customer())
  updateOrder.mockResolvedValue(undefined)
})

describe('OrderDetailPage', () => {
  it('shows the order with its statuses editable inline', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Заказ №5' })).toBeInTheDocument()
    // The two statuses render as selects pre-set to the order's current values.
    expect(screen.getByRole('combobox', { name: 'Статус оплаты' })).toHaveValue('pending')
    expect(screen.getByRole('combobox', { name: 'Статус отправки' })).toHaveValue('new')
  })

  it('shows the plant quantity with the "шт." unit', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    expect(screen.getByText('2 шт.')).toBeInTheDocument()
  })

  it('saves a status change in place via updateOrder, preserving the rest of the order', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус оплаты' }), 'paid')

    await waitFor(() => expect(updateOrder).toHaveBeenCalledTimes(1))
    expect(updateOrder).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({
        // The changed field…
        paymentStatus: 'paid',
        // …with everything else (and number/dateCreated) preserved.
        number: 5,
        dateCreated: 1000,
        shipmentStatus: 'new',
        customerId: 'c1',
      }),
    )
    // The id is overwritten in place, not stored in the body.
    expect(updateOrder.mock.calls[0][1]).not.toHaveProperty('id')
    // The optimistic value sticks on success.
    expect(screen.getByRole('combobox', { name: 'Статус оплаты' })).toHaveValue('paid')
  })

  it('rolls the status back and surfaces an error when the save fails', async () => {
    const user = userEvent.setup()
    updateOrder.mockRejectedValue(new Error('Сеть недоступна'))
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус отправки' }), 'shipped')

    // Error announced, and the select reverts to the original value.
    expect(await screen.findByRole('alert')).toHaveTextContent('Сеть недоступна')
    expect(screen.getByRole('combobox', { name: 'Статус отправки' })).toHaveValue('new')
  })
})
