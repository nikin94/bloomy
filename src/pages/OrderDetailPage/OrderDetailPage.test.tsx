import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

// Firebase-touching modules are mocked so the page never initializes the real
// SDK. We test the page render and the inline status save flow, not Firestore.
const fetchOrder = vi.fn()
const patchOrder = vi.fn()
const softDeleteOrder = vi.fn()
const fetchCustomer = vi.fn()
const updateCustomer = vi.fn()
const navigate = vi.fn()

vi.mock('../../firebase/orders', () => ({
  fetchOrder: (...args: unknown[]) => fetchOrder(...args),
  patchOrder: (...args: unknown[]) => patchOrder(...args),
  softDeleteOrder: (...args: unknown[]) => softDeleteOrder(...args),
}))
vi.mock('../../firebase/customers', () => ({
  fetchCustomer: (...args: unknown[]) => fetchCustomer(...args),
  updateCustomer: (...args: unknown[]) => updateCustomer(...args),
}))
// The photo gallery's storage layer is stubbed so the page never loads the
// Storage SDK; getPhotoUrl never resolves here (orders under test have no photos).
vi.mock('../../firebase/photos', () => ({
  getPhotoUrl: vi.fn(() => new Promise(() => {})),
  uploadOrderPhoto: vi.fn(() => Promise.resolve('orders/owner-1/o1/new.jpg')),
  deleteOrderPhoto: vi.fn(() => Promise.resolve()),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ id: 'o1' }),
  useNavigate: () => navigate,
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
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <MemoryRouter>
        <OrderDetailPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  fetchOrder.mockResolvedValue(order())
  fetchCustomer.mockResolvedValue(customer())
  patchOrder.mockResolvedValue(undefined)
  softDeleteOrder.mockResolvedValue(undefined)
  updateCustomer.mockResolvedValue(undefined)
})

describe('OrderDetailPage', () => {
  it('shows the order with its statuses editable inline', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Заказ №5' })).toBeInTheDocument()
    // The two statuses render as selects pre-set to the order's current values.
    expect(screen.getByRole('combobox', { name: 'Статус оплаты' })).toHaveValue('pending')
    expect(screen.getByRole('combobox', { name: 'Статус отправки' })).toHaveValue('new')
  })

  it('numbers each plant row and shows the quantity as a plain number', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    const itemsTable = screen.getByRole('table')
    // The single plant row is numbered "1" (leading № column)…
    const cells = within(itemsTable).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('1')
    // …and its quantity (2) shows as a bare number, not "×2".
    expect(within(itemsTable).getByText('Роза')).toBeInTheDocument()
    expect(within(itemsTable).getByText('2')).toBeInTheDocument()
    expect(within(itemsTable).queryByText('×2')).not.toBeInTheDocument()
  })

  it('saves a status change as a partial patch (only the changed field)', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус оплаты' }), 'paid')

    await waitFor(() => expect(patchOrder).toHaveBeenCalledTimes(1))
    // A per-field merge: ONLY the changed field is written, so a concurrent edit
    // to another field (on another device) is never clobbered.
    expect(patchOrder).toHaveBeenCalledWith('o1', { paymentStatus: 'paid' })
    const saved = patchOrder.mock.calls[0][1]
    expect(saved).not.toHaveProperty('shipmentStatus')
    expect(saved).not.toHaveProperty('id')
    // The optimistic value sticks on success.
    expect(screen.getByRole('combobox', { name: 'Статус оплаты' })).toHaveValue('paid')
  })

  it('stamps the completion time when the order is marked delivered', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус отправки' }), 'delivered')

    await waitFor(() => expect(patchOrder).toHaveBeenCalledTimes(1))
    const saved = patchOrder.mock.calls[0][1]
    expect(saved.shipmentStatus).toBe('delivered')
    expect(typeof saved.completedAt).toBe('number')
    // The completion row appears once stamped.
    expect(await screen.findByText('Завершён')).toBeInTheDocument()
  })

  it('clears the completion time when a completed order leaves a terminal status', async () => {
    const user = userEvent.setup()
    fetchOrder.mockResolvedValue(order({ shipmentStatus: 'delivered', completedAt: 1700 }))
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    expect(screen.getByText('Завершён')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус отправки' }), 'new')

    await waitFor(() => expect(patchOrder).toHaveBeenCalledTimes(1))
    // Reopened — the patch carries completedAt: null, the signal patchOrder turns
    // into a deleteField() so the stamp is removed.
    expect(patchOrder.mock.calls[0][1].completedAt).toBeNull()
    expect(screen.queryByText('Завершён')).not.toBeInTheDocument()
  })

  it('soft-deletes the order after confirming and returns to the list', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    // Delete asks for confirmation in a dialog before doing anything.
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить заказ №5?' })
    expect(softDeleteOrder).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(softDeleteOrder).toHaveBeenCalledWith('o1'))
    // On success the user is sent back to the list (where it no longer appears).
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders'))
  })

  it('edits the customer in a dialog and reflects the new name live', async () => {
    const user = userEvent.setup()
    fetchCustomer.mockResolvedValue(customer({ name: 'Анна', phone: '+700' }))
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    expect(screen.getByText('Анна')).toBeInTheDocument()

    // The edit button sits in the customer row; clicking it opens the form
    // prefilled with the current customer values.
    await user.click(screen.getByRole('button', { name: 'Редактировать клиента' }))
    const dialog = await screen.findByRole('dialog', { name: 'Редактирование клиента' })
    const nameField = within(dialog).getByLabelText('Имя клиента')
    expect(nameField).toHaveValue('Анна')
    expect(within(dialog).getByLabelText('Телефон')).toHaveValue('+700')

    await user.clear(nameField)
    await user.type(nameField, 'Анна Петрова')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    // The customer record is updated and the page reflects the new name without
    // a refetch; the dialog closes.
    await waitFor(() =>
      expect(updateCustomer).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ name: 'Анна Петрова', phone: '+700' }),
      ),
    )
    expect(await screen.findByText('Анна Петрова')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('persists a photo removal as a per-field patch of the new list', async () => {
    const user = userEvent.setup()
    fetchOrder.mockResolvedValue(order({ photos: ['orders/owner-1/o1/a.jpg'] }))
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.click(screen.getByRole('button', { name: 'Удалить фото' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить фото?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    // The page writes ONLY the new photos array (per-field merge), and the order
    // is NOT soft-deleted by a photo removal.
    await waitFor(() => expect(patchOrder).toHaveBeenCalledWith('o1', { photos: [] }))
    expect(softDeleteOrder).not.toHaveBeenCalled()
  })
})
