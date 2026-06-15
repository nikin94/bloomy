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

vi.mock('../../firebase/customers', () => ({
  fetchCustomers: (...args: unknown[]) => fetchCustomers(...args),
  softDeleteCustomer: (...args: unknown[]) => softDeleteCustomer(...args),
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
