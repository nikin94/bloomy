import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderPageInLayout } from '@/test/renderPageInLayout'
import { customer } from '@/test/factories'

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
// Sidebar imports signOutUser from here; stub it so firebase stays untouched.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))

// Imported after the mocks above are registered.
import CustomersPage from './CustomersPage'


// The header now lives in AppLayout (above the page in the route tree), and the
// page publishes its search control into it via the header-actions slot — so the
// page is mounted inside AppLayout here, exactly as in the app, for the header +
// its actions to render.
const renderPage = () => renderPageInLayout(<CustomersPage />)

// The list renders BOTH the desktop table and the mobile card stack — jsdom has
// no media queries, so both are in the DOM. Scope content/action assertions to
// the desktop table to act on a single copy.
const table = () => within(screen.getByTestId('customers-table'))

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

    await screen.findByTestId('customers-table')
    // Each table row is a link named "Открыть клиента <name>"; they read in name order.
    const rows = table().getAllByRole('link')
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Открыть клиента Анна',
      'Открыть клиента Борис',
    ])
    // The list fetch asks for active customers only (no includeDeleted).
    expect(fetchCustomers).toHaveBeenCalledWith('owner-1')
  })

  it('exposes each row as a keyboard-activatable link to the customer page', async () => {
    fetchCustomers.mockResolvedValue([customer({ name: 'Анна' })])
    renderPage()
    await screen.findByTestId('customers-table')
    // The row is a link (role + accessible name), focusable so a keyboard user
    // can open the customer page; the edit/delete icons stay separate buttons.
    const link = table().getByRole('link', { name: 'Открыть клиента Анна' })
    expect(link).toHaveAttribute('tabindex', '0')
    // The whole row is customer PII, so it carries Sentry Replay's mask marker
    // (replays star out its text; the name-bearing aria-label is masked via
    // maskAttributes — see observability/sentry.ts).
    expect(link).toHaveAttribute('data-sentry-mask')
  })

  it('shows the full customer details (phone, address, note) in the list', async () => {
    fetchCustomers.mockResolvedValue([
      customer({ name: 'Анна', phone: '+700', address: 'ул. Пушкина, 1', note: 'Любит пионы' }),
    ])
    renderPage()

    await screen.findByTestId('customers-table')
    const row = table().getByRole('link', { name: 'Открыть клиента Анна' })
    expect(within(row).getByText('Анна')).toBeInTheDocument()
    expect(within(row).getByText('+700')).toBeInTheDocument()
    expect(within(row).getByText('ул. Пушкина, 1')).toBeInTheDocument()
    expect(within(row).getByText('Любит пионы')).toBeInTheDocument()
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

    await screen.findByTestId('customers-table')
    await user.click(table().getByRole('button', { name: 'Удалить клиента Анна' }))
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

    await screen.findByTestId('customers-table')
    await user.click(table().getByRole('button', { name: 'Редактировать клиента Анна' }))
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
    await waitFor(() => expect(table().getByText('Анна Петрова')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens only one edit dialog at a time', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([
      customer({ id: 'c1', name: 'Анна' }),
      customer({ id: 'c2', name: 'Борис' }),
    ])
    renderPage()

    await screen.findByTestId('customers-table')
    await user.click(table().getByRole('button', { name: 'Редактировать клиента Анна' }))
    // Switching to another customer replaces the dialog rather than stacking a
    // second one — the page holds a single editing target.
    await user.click(table().getByRole('button', { name: 'Редактировать клиента Борис' }))

    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(1)
    expect(within(dialogs[0]).getByLabelText('Имя клиента')).toHaveValue('Борис')
  })

  it('does not save an edit with an empty name', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ name: 'Анна' })])
    renderPage()

    await screen.findByTestId('customers-table')
    await user.click(table().getByRole('button', { name: 'Редактировать клиента Анна' }))
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

    await screen.findByTestId('customers-table')
    await user.click(table().getByRole('button', { name: 'Удалить клиента Анна' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(softDeleteCustomer).not.toHaveBeenCalled()
    expect(table().getByText('Анна')).toBeInTheDocument()
  })

  it('narrows the list to customers matching the search (by name or phone)', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([
      customer({ id: 'c1', name: 'Анна', phone: '+700' }),
      customer({ id: 'c2', name: 'Борис', phone: '+711' }),
    ])
    renderPage()
    await screen.findByTestId('customers-table')

    // The header renders both layouts (desktop + mobile) in jsdom, so scope the
    // search to the desktop bar to act on a single copy. It's collapsed behind a
    // loupe; click it to reveal the input.
    const header = within(screen.getByTestId('sidebar-desktop'))
    await user.click(await header.findByRole('button', { name: 'Поиск' }))
    await user.type(header.getByRole('textbox', { name: 'Поиск клиентов' }), 'Борис')

    expect(table().getByText('Борис')).toBeInTheDocument()
    expect(table().queryByText('Анна')).not.toBeInTheDocument()
  })

  it('shows a "nothing found" message when the search matches no customer', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ name: 'Анна' })])
    renderPage()
    await screen.findByTestId('customers-table')

    const header = within(screen.getByTestId('sidebar-desktop'))
    await user.click(await header.findByRole('button', { name: 'Поиск' }))
    await user.type(header.getByRole('textbox', { name: 'Поиск клиентов' }), 'нет такого')

    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
    expect(screen.queryByText('Анна')).not.toBeInTheDocument()
  })
})
