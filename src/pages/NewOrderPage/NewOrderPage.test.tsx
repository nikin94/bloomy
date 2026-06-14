import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/auth-context'
import type { Customer } from '../../types/customer'

// Firebase-touching modules are mocked so the data layer never initializes the
// real SDK. The form's behaviour (validation, item rows, prefill, submit
// payload) is what we test — not Firestore.
const createOrder = vi.fn()
const createCustomer = vi.fn()
const fetchCustomers = vi.fn()
const navigate = vi.fn()

vi.mock('../../lib/orders', () => ({ createOrder: (...args: unknown[]) => createOrder(...args) }))
vi.mock('../../lib/customers', () => ({
  createCustomer: (...args: unknown[]) => createCustomer(...args),
  fetchCustomers: (...args: unknown[]) => fetchCustomers(...args),
}))
// AppHeader imports signOutUser from here; stub it so firebase stays untouched.
vi.mock('../../lib/auth', () => ({ signOutUser: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

// Imported after the mocks above are registered.
import NewOrderPage from './NewOrderPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  ownerId: 'owner-1',
  name: 'Анна',
  createdAt: 0,
  ...over,
})

function renderForm() {
  return render(
    <AuthContext.Provider value={{ user: USER, loading: false }}>
      <MemoryRouter>
        <NewOrderPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchCustomers.mockResolvedValue([])
  createCustomer.mockResolvedValue('new-customer-id')
  createOrder.mockResolvedValue('new-order-id')
})

describe('NewOrderPage', () => {
  it('renders the new-customer form once the (empty) address book loads', async () => {
    renderForm()
    // The form is gated on the customer fetch; the name input appears after it.
    expect(await screen.findByLabelText('Имя клиента')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Новый заказ' })).toBeInTheDocument()
  })

  it('defaults to the "existing" picker when the address book is non-empty', async () => {
    fetchCustomers.mockResolvedValue([customer({ phone: '+7 900' })])
    renderForm()
    const picker = await screen.findByRole('combobox', { name: 'Существующий клиент' })
    expect(picker).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Анна (+7 900)' })).toBeInTheDocument()
  })

  it('requires a customer name in "new" mode', async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByLabelText('Имя клиента')
    await user.click(screen.getByRole('button', { name: 'Сохранить заказ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Укажите имя клиента')
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('requires at least one named plant', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(await screen.findByLabelText('Имя клиента'), 'Борис')
    await user.click(screen.getByRole('button', { name: 'Сохранить заказ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Добавьте хотя бы одно растение')
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('clears the "select a customer" error once a customer is picked', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer()])
    renderForm()
    const picker = await screen.findByRole('combobox', { name: 'Существующий клиент' })
    // Submit with the placeholder still selected → error.
    await user.click(screen.getByRole('button', { name: 'Сохранить заказ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Выберите клиента')
    // Picking a real customer clears exactly that error.
    await user.selectOptions(picker, 'c1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the add-plant button disabled until the last row has a name', async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByLabelText('Имя клиента')
    const addBtn = screen.getByRole('button', { name: '+ Добавить растение' })
    expect(addBtn).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    expect(addBtn).toBeEnabled()
  })

  it('flags a plant row that has a name but no price', async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByLabelText('Имя клиента')
    const priceInput = screen.getByPlaceholderText('Цена, ₽')
    expect(priceInput).toHaveAttribute('aria-invalid', 'false')
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    expect(priceInput).toHaveAttribute('aria-invalid', 'true')
  })

  it('submits a new-customer order with amounts in kopecks and navigates to it', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(await screen.findByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    await user.type(screen.getByPlaceholderText('Цена, ₽'), '149,90')
    await user.type(screen.getByPlaceholderText('0'), '300') // delivery cost
    await user.click(screen.getByRole('button', { name: 'Сохранить заказ' }))

    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    // A new customer is created first, then the order references its id.
    expect(createCustomer).toHaveBeenCalledTimes(1)
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner-1',
        customerId: 'new-customer-id',
        currency: 'RUB',
        deliveryMethod: 'post',
        deliveryPriceMinor: 30000,
        plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 14990 }],
      }),
    )
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/new-order-id'))
  })

  it('shows the live total from items plus delivery', async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByLabelText('Имя клиента')
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    await user.type(screen.getByPlaceholderText('Цена, ₽'), '100')
    await user.type(screen.getByPlaceholderText('0'), '50')
    // 100 ₽ × 1 + 50 ₽ delivery = 150,00 ₽ (NBSP between number and symbol).
    expect(screen.getByText(/150,00/)).toBeInTheDocument()
  })

  it('restores the prefilled address when toggling the mode slider back to existing', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ address: 'ул. Ленина, 1' })])
    renderForm()
    const picker = await screen.findByRole('combobox', { name: 'Существующий клиент' })
    await user.selectOptions(picker, 'c1')
    const addressInput = screen.getByDisplayValue('ул. Ленина, 1')

    // Switch to "new" → address clears; back to "existing" → it is restored.
    await user.click(screen.getByRole('radio', { name: 'Новый' }))
    expect(addressInput).toHaveValue('')
    await user.click(screen.getByRole('radio', { name: 'Существующий' }))
    expect(addressInput).toHaveValue('ул. Ленина, 1')
  })
})
