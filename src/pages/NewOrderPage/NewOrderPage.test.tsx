import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import { SettingsContext } from '../../context/settingsContext'
import type { SettingsState } from '../../context/settingsContext'
import type { Customer } from '../../types/customer'

// Firebase-touching modules are mocked so the data layer never initializes the
// real SDK. The form's behaviour (validation, item rows, prefill, submit
// payload) is what we test — not Firestore.
const createOrder = vi.fn()
const createCustomer = vi.fn()
const fetchCustomers = vi.fn()
const navigate = vi.fn()

vi.mock('../../firebase/orders', () => ({ createOrder: (...args: unknown[]) => createOrder(...args) }))
vi.mock('../../firebase/customers', () => ({
  createCustomer: (...args: unknown[]) => createCustomer(...args),
  fetchCustomers: (...args: unknown[]) => fetchCustomers(...args),
}))
// AppHeader imports signOutUser from here; stub it so firebase stays untouched.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))
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

// A promise whose resolution is controlled by the test, so we can hold an
// async submit "in flight" while we probe the double-submit guard.
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

// Settings context with overridable order defaults, so a test can verify the
// form prefills delivery/payment from the user's saved preferences.
const settingsState = (over: Partial<SettingsState> = {}): SettingsState => ({
  fontScale: 1,
  theme: 'dark',
  defaultDeliveryMethod: 'post',
  defaultPaymentMethod: 'cash',
  previewFontScale: vi.fn(),
  previewTheme: vi.fn(),
  saveSettings: vi.fn(),
  ...over,
})

function renderForm(settings: SettingsState = settingsState()) {
  return render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <SettingsContext.Provider value={settings}>
        <MemoryRouter>
          <NewOrderPage />
        </MemoryRouter>
      </SettingsContext.Provider>
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
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Укажите имя клиента')
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('requires at least one named plant', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(await screen.findByLabelText('Имя клиента'), 'Борис')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Добавьте хотя бы одно растение')
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('clears the "select a customer" error once a customer is picked', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer()])
    renderForm()
    const picker = await screen.findByRole('combobox', { name: 'Существующий клиент' })
    // Submit with the placeholder still selected → error.
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
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

  it('focuses the new row name input after adding a plant', async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByLabelText('Имя клиента')
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    await user.click(screen.getByRole('button', { name: '+ Добавить растение' }))
    // The just-added (second) name input grabs focus so the user can type at once.
    const nameInputs = screen.getAllByPlaceholderText('Название')
    expect(nameInputs).toHaveLength(2)
    expect(nameInputs[1]).toHaveFocus()
  })

  it('flags a named plant row without a price only after a submit attempt', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(await screen.findByLabelText('Имя клиента'), 'Борис')
    const priceInput = screen.getByPlaceholderText('Цена, ₽')

    // Typing a name but no price must NOT flag the field while editing.
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    expect(priceInput).toHaveAttribute('aria-invalid', 'false')

    // The flag appears only once the user tries to save without a price.
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(priceInput).toHaveAttribute('aria-invalid', 'true')

    // Filling the price clears the flag again.
    await user.type(priceInput, '149,90')
    expect(priceInput).toHaveAttribute('aria-invalid', 'false')
  })

  it('keeps the price field numeric, dropping letters and extra separators', async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByLabelText('Имя клиента')
    const priceInput = screen.getByPlaceholderText('Цена, ₽')

    // Letters are dropped, a single decimal separator is kept.
    await user.type(priceInput, '1a2b,3c')
    expect(priceInput).toHaveValue('12,3')

    // The fractional part is capped at two digits.
    await user.clear(priceInput)
    await user.type(priceInput, '12,999')
    expect(priceInput).toHaveValue('12,99')
  })

  it('blocks saving when a named plant has no price', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(await screen.findByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    // No price entered for the named plant.
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Укажите цену для каждого растения')
    expect(createOrder).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()

    // Filling the price lets the save through.
    await user.type(screen.getByPlaceholderText('Цена, ₽'), '149,90')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
  })

  it('submits a new-customer order in kopecks and navigates to the list to highlight it', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(await screen.findByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    await user.type(screen.getByPlaceholderText('Цена, ₽'), '149,90')
    await user.type(screen.getByPlaceholderText('0'), '300') // delivery cost
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

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
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/orders', { state: { highlightId: 'new-order-id' } }),
    )
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

  it('ignores a second submit while the first is still saving', async () => {
    const user = userEvent.setup()
    // Hold the new-customer creation in flight so `saving` stays true.
    const pending = deferred<string>()
    createCustomer.mockReturnValue(pending.promise)
    renderForm()
    await user.type(await screen.findByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    await user.type(screen.getByPlaceholderText('Цена, ₽'), '100')

    const form = screen.getByRole('button', { name: 'Сохранить' }).closest('form')!
    // First submit kicks off createCustomer and flips `saving` true.
    fireEvent.submit(form)
    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1))
    // Second submit while still saving must early-return (the `if (saving)` guard),
    // not start another createCustomer.
    fireEvent.submit(form)
    expect(createCustomer).toHaveBeenCalledTimes(1)

    pending.resolve('new-customer-id')
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
  })

  it('reuses the created customer instead of duplicating it when the order retry succeeds', async () => {
    const user = userEvent.setup()
    // createCustomer succeeds; the first createOrder fails, the retry succeeds.
    createOrder.mockRejectedValueOnce(new Error('network')).mockResolvedValue('order-id')
    renderForm()
    await user.type(await screen.findByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    await user.type(screen.getByPlaceholderText('Цена, ₽'), '100')

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('network')
    expect(createCustomer).toHaveBeenCalledTimes(1)

    // Retry: the form has flipped to the "existing" branch, so no new customer
    // is created — the order reuses the id from the first createCustomer.
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/orders', { state: { highlightId: 'order-id' } }),
    )
    expect(createCustomer).toHaveBeenCalledTimes(1)
    expect(createOrder).toHaveBeenCalledTimes(2)
    expect(createOrder).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: 'new-customer-id' }),
    )
  })

  it('surfaces a createOrder failure as an error and does not navigate', async () => {
    const user = userEvent.setup()
    createOrder.mockRejectedValue(new Error('Не удалось сохранить'))
    renderForm()
    await user.type(await screen.findByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    await user.type(screen.getByPlaceholderText('Цена, ₽'), '100')

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('removes a plant row and keeps the last row undeletable', async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByLabelText('Имя клиента')
    // With a single row the form must keep it — its remove button is disabled.
    expect(screen.getByRole('button', { name: 'Удалить растение' })).toBeDisabled()

    // Add a second row, then remove it.
    await user.type(screen.getByPlaceholderText('Название'), 'Роза')
    await user.click(screen.getByRole('button', { name: '+ Добавить растение' }))
    expect(screen.getAllByPlaceholderText('Название')).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: 'Удалить растение' })[1])
    expect(screen.getAllByPlaceholderText('Название')).toHaveLength(1)
    // The surviving first row kept its value — removal didn't reindex state.
    expect(screen.getByPlaceholderText('Название')).toHaveValue('Роза')
  })

  it('prefills the delivery/payment method from the saved order defaults', async () => {
    renderForm(settingsState({ defaultDeliveryMethod: 'cdek', defaultPaymentMethod: 'card' }))
    await screen.findByLabelText('Имя клиента')

    // A fresh order opens with the user's saved default methods, not post/cash.
    expect(screen.getByRole('combobox', { name: 'Способ доставки' })).toHaveValue('cdek')
    expect(screen.getByRole('combobox', { name: 'Тип оплаты' })).toHaveValue('card')
  })
})
