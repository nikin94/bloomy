import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import type { Customer } from '../../types/customer'

// Firebase-touching modules are mocked so the page never initializes the real
// SDK. We test the list rendering and the inline delete flow, not Firestore.
const fetchCustomers = vi.fn()
const softDeleteCustomer = vi.fn()
const updateCustomer = vi.fn()

vi.mock('../../firebase/customers', () => ({
  fetchCustomers: (...args: unknown[]) => fetchCustomers(...args),
  softDeleteCustomer: (...args: unknown[]) => softDeleteCustomer(...args),
  updateCustomer: (...args: unknown[]) => updateCustomer(...args),
}))
// AppHeader imports signOutUser from here; stub it so firebase stays untouched.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))

// Imported after the mocks above are registered.
import CustomersPage from './CustomersPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

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
        <CustomersPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  fetchCustomers.mockResolvedValue([])
  softDeleteCustomer.mockResolvedValue(undefined)
  updateCustomer.mockResolvedValue(undefined)
})

describe('CustomersPage', () => {
  it('lists the active customers alphabetically', async () => {
    fetchCustomers.mockResolvedValue([customer({ id: 'c2', name: 'Борис' }), customer({ name: 'Анна' })])
    renderPage()

    const items = await screen.findAllByRole('listitem')
    expect(items.map((li) => within(li).getByText(/Анна|Борис/).textContent)).toEqual([
      'Анна',
      'Борис',
    ])
    // The list fetch asks for active customers only (no includeDeleted).
    expect(fetchCustomers).toHaveBeenCalledWith('owner-1')
  })

  it('shows an empty state when there are no customers', async () => {
    fetchCustomers.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Клиентов пока нет')).toBeInTheDocument()
  })

  it('soft-deletes a customer after confirming and drops it from the list', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ name: 'Анна' })])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Удалить клиента Анна' }))
    // Confirm step appears in place; confirming calls the data layer.
    await user.click(screen.getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(softDeleteCustomer).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(screen.queryByText('Анна')).not.toBeInTheDocument())
  })

  it('edits a customer inline and reflects the new name in the list', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ name: 'Анна', phone: '+700' })])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Редактировать клиента Анна' }))
    // The inline form is prefilled with the current values.
    const nameField = screen.getByLabelText('Имя клиента')
    expect(nameField).toHaveValue('Анна')
    expect(screen.getByLabelText('Телефон')).toHaveValue('+700')

    await user.clear(nameField)
    await user.type(nameField, 'Анна Петрова')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() =>
      expect(updateCustomer).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ name: 'Анна Петрова', phone: '+700' }),
      ),
    )
    // The list updates and the inline form closes.
    expect(await screen.findByText('Анна Петрова')).toBeInTheDocument()
    expect(screen.queryByLabelText('Имя клиента')).not.toBeInTheDocument()
  })

  it('does not save an edit with an empty name', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ name: 'Анна' })])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Редактировать клиента Анна' }))
    await user.clear(screen.getByLabelText('Имя клиента'))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(updateCustomer).not.toHaveBeenCalled()
    // The form stays open (name field still present).
    expect(screen.getByLabelText('Имя клиента')).toBeInTheDocument()
  })

  it('keeps the customer when the delete is cancelled', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ name: 'Анна' })])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Удалить клиента Анна' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(softDeleteCustomer).not.toHaveBeenCalled()
    expect(screen.getByText('Анна')).toBeInTheDocument()
  })

  it('surfaces a delete error without hiding the list', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ name: 'Анна' })])
    softDeleteCustomer.mockRejectedValue(new Error('Сеть недоступна'))
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Удалить клиента Анна' }))
    await user.click(screen.getByRole('button', { name: 'Удалить' }))

    // The error is announced, but the row (and the rest of the list) stays.
    expect(await screen.findByRole('alert')).toHaveTextContent('Сеть недоступна')
    expect(screen.getByText('Анна')).toBeInTheDocument()
    // The row reset its confirm state, so the trash button is back.
    expect(screen.getByRole('button', { name: 'Удалить клиента Анна' })).toBeInTheDocument()
  })
})
