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
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
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

  it('shows the full customer details (phone, address, note) in the list', async () => {
    fetchCustomers.mockResolvedValue([
      customer({ name: 'Анна', phone: '+700', address: 'ул. Пушкина, 1', note: 'Любит пионы' }),
    ])
    renderPage()

    const item = await screen.findByRole('listitem')
    expect(within(item).getByText('Анна')).toBeInTheDocument()
    expect(within(item).getByText('+700')).toBeInTheDocument()
    expect(within(item).getByText('ул. Пушкина, 1')).toBeInTheDocument()
    expect(within(item).getByText('Любит пионы')).toBeInTheDocument()
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
    // A confirmation dialog opens; confirming there calls the data layer.
    const dialog = within(screen.getByRole('dialog', { name: 'Удалить клиента Анна?' }))
    await user.click(dialog.getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(softDeleteCustomer).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(screen.queryByText('Анна')).not.toBeInTheDocument())
  })

  it('edits a customer in a modal and reflects the new name in the list', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ name: 'Анна', phone: '+700' })])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Редактировать клиента Анна' }))
    // Editing opens a dialog prefilled with the current values.
    const dialog = within(screen.getByRole('dialog', { name: 'Редактирование клиента' }))
    const nameField = dialog.getByLabelText('Имя клиента')
    expect(nameField).toHaveValue('Анна')
    expect(dialog.getByLabelText('Телефон')).toHaveValue('+700')

    await user.clear(nameField)
    await user.type(nameField, 'Анна Петрова')
    await user.click(dialog.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() =>
      expect(updateCustomer).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ name: 'Анна Петрова', phone: '+700' }),
      ),
    )
    // The list updates and the dialog closes.
    expect(await screen.findByText('Анна Петрова')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens only one edit dialog at a time', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([
      customer({ id: 'c1', name: 'Анна' }),
      customer({ id: 'c2', name: 'Борис' }),
    ])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Редактировать клиента Анна' }))
    // Switching to another customer replaces the dialog rather than stacking a
    // second one — the page holds a single editing target.
    await user.click(screen.getByRole('button', { name: 'Редактировать клиента Борис' }))

    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(1)
    expect(within(dialogs[0]).getByLabelText('Имя клиента')).toHaveValue('Борис')
  })

  it('does not save an edit with an empty name', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ name: 'Анна' })])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Редактировать клиента Анна' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Редактирование клиента' }))
    await user.clear(dialog.getByLabelText('Имя клиента'))
    await user.click(dialog.getByRole('button', { name: 'Сохранить' }))

    expect(updateCustomer).not.toHaveBeenCalled()
    // The dialog stays open (name field still present).
    expect(dialog.getByLabelText('Имя клиента')).toBeInTheDocument()
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
})
