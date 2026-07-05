import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from 'firebase/auth'
import { QueryWrapper } from '@/test/queryWrapper'
import { queryKeys } from '@/queries/keys'
import { AuthContext } from '@/context/authContext'
import type { Order } from '@/types/order'
import { order as baseOrder, customer } from '@/test/factories'

// Firebase-touching modules are mocked so the data layer never initializes the
// real SDK. We test that the edit page loads an order, prefills the shared form,
// and saves via updateOrder while preserving the order's id, number and date.
const fetchOrder = vi.fn()
const updateOrder = vi.fn()
const fetchCustomers = vi.fn()
const fetchCustomer = vi.fn()
const createCustomer = vi.fn()
const navigate = vi.fn()

vi.mock('../../firebase/orders', () => ({
  fetchOrder: (...args: unknown[]) => fetchOrder(...args),
  updateOrder: (...args: unknown[]) => updateOrder(...args),
  // OrderForm fetches orders to build the plant-name autocomplete list; stub it
  // empty so the form renders with no suggestions and Firestore stays untouched.
  fetchOrders: () => Promise.resolve([]),
  // OrderForm imports newOrderId (used only in create mode; unused on edit).
  newOrderId: () => 'pre-generated-order-id',
}))
// OrderForm imports the Storage layer (only mounts the gallery in create mode);
// stub it so no real Firebase Storage is touched.
vi.mock('../../firebase/photos', () => ({
  uploadOrderPhoto: vi.fn(),
  getPhotoUrl: vi.fn(),
  deleteOrderPhoto: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../firebase/customers', () => ({
  fetchCustomers: (...args: unknown[]) => fetchCustomers(...args),
  fetchCustomer: (...args: unknown[]) => fetchCustomer(...args),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
}))
// Stub signOutUser so the real Firebase SDK stays out of the test.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
  useParams: () => ({ id: 'o1' }),
}))

// Imported after the mocks above are registered.
import EditOrderPage from './EditOrderPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

// Same observable defaults as before consolidation: this page's edit fixture is
// order №5 with a delivery fee, a comment, and a Роза×2 line that the form prefills.
const order = (over: Partial<Order> = {}): Order =>
  baseOrder({
    number: 5,
    dateCreated: 1000,
    address: 'Main St 1',
    plants: [{ name: 'Роза', quantity: 2, unitPriceMinor: 14990 }],
    deliveryPriceMinor: 30000,
    comment: 'комментарий',
    ...over,
  })

function renderPage() {
  return render(
    <QueryWrapper>
      <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
        <MemoryRouter>
          <EditOrderPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryWrapper>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchOrder.mockResolvedValue(order())
  fetchCustomers.mockResolvedValue([customer()])
  fetchCustomer.mockResolvedValue(null)
  updateOrder.mockResolvedValue(undefined)
})

describe('EditOrderPage', () => {
  it('prefills the shared form from the loaded order', async () => {
    renderPage()

    // Heading carries the order number; the form is prefilled with the stored
    // plant, price (minor → input string), delivery price, and customer.
    expect(
      await screen.findByRole('heading', { name: 'Редактирование заказа №5' }),
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue('Роза')).toBeInTheDocument()
    expect(screen.getByDisplayValue('149,90')).toBeInTheDocument()
    expect(screen.getByDisplayValue('300')).toBeInTheDocument()
    expect(screen.getByDisplayValue('комментарий')).toBeInTheDocument()
    // The existing-customer picker opens with the order's customer selected.
    expect(screen.getByRole('combobox', { name: 'Существующий клиент' })).toHaveValue('c1')
  })

  it('saves via updateOrder preserving id, number and date, then returns to the order', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Редактирование заказа №5' })

    // Change a status and save.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус заказа' }), 'shipped')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(updateOrder).toHaveBeenCalledTimes(1))
    expect(updateOrder).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({
        // Preserved from the original order — NOT re-derived.
        number: 5,
        dateCreated: 1000,
        customerId: 'c1',
        // Edited field.
        shipmentStatus: 'shipped',
      }),
    )
    // Returns to the order's detail page after saving.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/o1'))
  })

  it('keeps a soft-deleted customer selectable when editing its order', async () => {
    // The order's customer was soft-deleted, so it is absent from the active
    // list; the form fetches it directly and keeps it as the selected option.
    fetchCustomers.mockResolvedValue([])
    fetchCustomer.mockResolvedValue(customer({ id: 'c1', name: 'Анна', isDeleted: true }))
    renderPage()

    const picker = await screen.findByRole('combobox', { name: 'Существующий клиент' })
    expect(picker).toHaveValue('c1')
    expect(fetchCustomer).toHaveBeenCalledWith('c1')
    // The option is marked as deleted so the user knows.
    expect(screen.getByRole('option', { name: /Анна.*удалён/ })).toBeInTheDocument()
  })

  it('shows a not-found message when the order is missing', async () => {
    fetchOrder.mockResolvedValue(null)
    renderPage()
    expect(await screen.findByText('Заказ не найден')).toBeInTheDocument()
  })

  it('does not reuse the detail page cache for a trashed order', async () => {
    // OrderDetailPage caches a trashed order under the `includeDeleted: true` key
    // (it opens trash read-only). EditOrderPage reads WITHOUT that flag — a
    // different key — so a cached trashed order must NOT satisfy the edit read;
    // fetchOrder is called, returns null (active-only), and the edit page shows
    // not-found instead of prefilling a form that would write to a soft-deleted doc.
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, networkMode: 'always', refetchOnReconnect: false },
      },
    })
    const trashed = order({ deletedAt: 2000 })
    // Seed exactly what OrderDetailPage would have cached (includeDeleted: true).
    client.setQueryData(queryKeys.order('o1', 'owner-1', true), trashed)
    // The edit read (includeDeleted falsy) resolves to null, as real fetchOrder does.
    fetchOrder.mockResolvedValue(null)

    render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
          <MemoryRouter>
            <EditOrderPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )

    // Cache miss on the edit key → fetchOrder ran → null → not-found (no form).
    expect(await screen.findByText('Заказ не найден')).toBeInTheDocument()
    expect(fetchOrder).toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: /Редактирование/ })).not.toBeInTheDocument()
  })
})
