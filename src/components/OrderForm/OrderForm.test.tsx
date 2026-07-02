import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import { SettingsContext } from '../../context/settingsContext'
import type { SettingsState } from '../../context/settingsContext'
import type { Order } from '../../types/order'
import type { Customer } from '../../types/customer'

// The order form is exercised end-to-end through NewOrderPage/EditOrderPage (the
// page wrappers own create-vs-edit persistence + navigation). These tests cover
// the SHARED component's own contract directly: heading, cancel wiring, prefill
// from initialOrder/seed, and that a valid form hands a built order to onSubmit.
const createCustomer = vi.fn()
const fetchCustomer = vi.fn()
const fetchCustomers = vi.fn()
const fetchOrders = vi.fn()

vi.mock('../../firebase/customers', () => ({
  createCustomer: (...a: unknown[]) => createCustomer(...a),
  fetchCustomer: (...a: unknown[]) => fetchCustomer(...a),
  fetchCustomers: (...a: unknown[]) => fetchCustomers(...a),
}))
vi.mock('../../firebase/orders', () => ({
  // OrderForm fetches orders only to build the plant-name autocomplete list, and
  // pre-generates the create order's id so photos can be stored under it up front.
  fetchOrders: (...a: unknown[]) => fetchOrders(...a),
  newOrderId: () => 'pre-generated-order-id',
}))
// The create form mounts the OrderPhotos gallery, which talks to the Storage
// layer; stub it so no real Firebase Storage is touched.
vi.mock('../../firebase/photos', () => ({
  uploadOrderPhoto: vi.fn(),
  getPhotoUrl: vi.fn(),
  deleteOrderPhoto: vi.fn().mockResolvedValue(undefined),
}))
// Stub signOutUser so the real Firebase SDK stays out of the test.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))

// Imported after the mocks above are registered.
import OrderForm from './OrderForm'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  ownerId: 'owner-1',
  name: 'Анна',
  createdAt: 0,
  ...over,
})

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  number: 1,
  dateCreated: 1700000000000,
  ownerId: 'owner-1',
  customerId: 'c1',
  address: 'ул. Пушкина, 1',
  plants: [{ name: 'Кактус', quantity: 2, unitPriceMinor: 14990 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
  ...over,
})

const settings = (): SettingsState => ({
  fontScale: 1,
  theme: 'dark',
  language: 'ru',
  defaultDeliveryMethod: 'post',
  defaultPaymentMethod: 'cash',
  defaultCurrency: 'RUB',
  previewFontScale: vi.fn(),
  previewTheme: vi.fn(),
  previewLanguage: vi.fn(),
  saveSettings: vi.fn(),
})

const renderForm = (props: Partial<React.ComponentProps<typeof OrderForm>> = {}) =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <SettingsContext.Provider value={settings()}>
        <MemoryRouter>
          <OrderForm
            heading="Новый заказ"
            onSubmit={props.onSubmit ?? vi.fn().mockResolvedValue(undefined)}
            onCancel={props.onCancel ?? vi.fn()}
            initialOrder={props.initialOrder}
            seed={props.seed}
          />
        </MemoryRouter>
      </SettingsContext.Provider>
    </AuthContext.Provider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  fetchCustomers.mockResolvedValue([])
  fetchCustomer.mockResolvedValue(null)
  fetchOrders.mockResolvedValue([])
  createCustomer.mockResolvedValue('new-customer-id')
})

describe('OrderForm', () => {
  it('renders the heading and starts in new-customer mode with no initial order', async () => {
    renderForm()
    // Gated on the customer fetch; the name input appears once it resolves.
    expect(await screen.findByLabelText('Имя клиента')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Новый заказ' })).toBeInTheDocument()
  })

  it('calls onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    renderForm({ onCancel })
    await screen.findByLabelText('Имя клиента')

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('mounts the photo gallery on a create form (an order id is known up front)', async () => {
    renderForm()
    await screen.findByLabelText('Имя клиента')
    // The OrderPhotos gallery renders its "Фото" heading + an add-photo tile.
    expect(screen.getByRole('heading', { name: 'Фото' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeInTheDocument()
  })

  it('does NOT mount the photo gallery when editing (photos are managed on the detail page)', async () => {
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    renderForm({ initialOrder: order({ customerId: 'c1' }) })
    await screen.findByRole('combobox', { name: 'Существующий клиент' })
    expect(screen.queryByRole('heading', { name: 'Фото' })).not.toBeInTheDocument()
  })

  it('prefills the plant rows and existing-customer selection from initialOrder', async () => {
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    renderForm({ initialOrder: order({ customerId: 'c1', plants: [{ name: 'Фиалка', quantity: 3, unitPriceMinor: 50000 }] }) })

    // The customer picker resolves to the existing customer, and the plant row
    // is seeded with the stored plant's name.
    expect(await screen.findByRole('combobox', { name: 'Существующий клиент' })).toHaveValue('c1')
    expect(screen.getByLabelText('Название')).toHaveValue('Фиалка')
  })

  it('hands a built order to onSubmit when a prefilled (valid) form is saved', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    renderForm({ onSubmit, initialOrder: order({ customerId: 'c1' }) })
    await screen.findByRole('combobox', { name: 'Существующий клиент' })

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.customerId).toBe('c1')
    expect(payload.plants).toEqual([{ name: 'Кактус', quantity: 2, unitPriceMinor: 14990 }])
    // The caller owns dateCreated (create stamps it, edit preserves it).
    expect(payload).not.toHaveProperty('dateCreated')
  })

  it('drops a dangling customer FK when the seeded customer no longer exists', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    // The address book has one OTHER customer; the repeated order points at a
    // customer that has been hard-deleted, so fetchCustomer resolves null.
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    fetchCustomer.mockResolvedValue(null)
    renderForm({ onSubmit, seed: order({ customerId: 'gone' }) })

    // The picker must NOT keep the dangling id — it falls back to "no selection"
    // rather than silently carrying a broken customer reference.
    const picker = await screen.findByRole('combobox', { name: 'Существующий клиент' })
    expect(picker).toHaveValue('')

    // Saving is blocked by the select-customer guard, so a broken FK never
    // persists — everything else in the form was validly prefilled from the seed.
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('drops a dangling customer FK when the seeded-customer fetch throws', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    // Same dangling-FK scenario, but fetchCustomer REJECTS (transient network /
    // rules change) instead of resolving null. A throw must be treated the same
    // as "unresolved" — the stale id is dropped, not left to save a broken FK.
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    fetchCustomer.mockRejectedValue(new Error('network'))
    renderForm({ onSubmit, seed: order({ customerId: 'gone' }) })

    const picker = await screen.findByRole('combobox', { name: 'Существующий клиент' })
    expect(picker).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
