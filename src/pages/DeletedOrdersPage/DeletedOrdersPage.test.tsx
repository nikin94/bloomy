import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderPageInLayout } from '@/test/renderPageInLayout'
import type { Order } from '@/types/order'
import { order as baseOrder, customer } from '@/test/factories'

// Firebase-touching modules are mocked so the page never initializes the real
// SDK. We test the trash list rendering (same DataTable as the active list), the
// search/filter, and that a row opens the order's detail page (where Restore now
// lives) — not Firestore.
const fetchDeletedOrders = vi.fn()
const fetchCustomers = vi.fn()
const hardDeleteOrders = vi.fn()
const navigate = vi.fn()

vi.mock('../../firebase/orders', () => ({
  fetchDeletedOrders: (...args: unknown[]) => fetchDeletedOrders(...args),
  hardDeleteOrders: (...args: unknown[]) => hardDeleteOrders(...args),
}))
vi.mock('../../firebase/customers', () => ({
  fetchCustomers: (...args: unknown[]) => fetchCustomers(...args),
}))
// Sidebar imports signOutUser from here; stub it so firebase stays untouched.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

// Imported after the mocks above are registered.
import DeletedOrdersPage from './DeletedOrdersPage'


// Same observable defaults as before consolidation: a trashed order №5 with a
// latin address (the canonical Роза×1 line and zero delivery are reused as-is).
const order = (over: Partial<Order> = {}): Order =>
  baseOrder({
    number: 5,
    dateCreated: 1000,
    address: 'Main St 1',
    isDeleted: true,
    ...over,
  })

// The header now lives in AppLayout (above the page in the route tree), and the
// page publishes its search + filter controls into it via the header-actions
// slot — so the page is mounted inside AppLayout here, as in the app, for the
// header and its actions to render.
const renderPage = () => renderPageInLayout(<DeletedOrdersPage />)

// The desktop table and mobile cards both render in jsdom; scope to one layout.
const table = () => within(screen.getByTestId('orders-table'))
// Search/filter actions render in both header layouts; scope to the desktop bar.
const header = () => within(screen.getByTestId('sidebar-desktop'))

beforeEach(() => {
  vi.clearAllMocks()
  fetchDeletedOrders.mockResolvedValue([])
  fetchCustomers.mockResolvedValue([customer()])
  // The page observes the delete promise now (visible error on rejection).
  hardDeleteOrders.mockResolvedValue(undefined)
})

describe('DeletedOrdersPage', () => {
  it('lists deleted orders in the same table layout, with the resolved name', async () => {
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5, customerId: 'c1' })])
    renderPage()

    await screen.findByTestId('orders-table')
    // The customer name is resolved via the customers lookup, not stored on the order.
    expect(table().getByText('Анна')).toBeInTheDocument()
    expect(table().getByText('5')).toBeInTheDocument()
    // The trash fetch asks for the owner's deleted orders.
    expect(fetchDeletedOrders).toHaveBeenCalledWith('owner-1')
  })

  it('shows no auto-purge countdown column — the trash keeps orders until emptied', async () => {
    fetchDeletedOrders.mockResolvedValue([
      order({ id: 'o1', number: 5, customerId: 'c1', deletedAt: Date.now() }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    expect(table().queryByText('Удаление')).not.toBeInTheDocument()
    expect(table().queryByText(/дней|дня|день/)).not.toBeInTheDocument()
  })

  it('empties the trash only after confirming: hard-deletes every trashed order', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([
      order({ id: 'o1', number: 5, customerId: 'c1', deletedAt: Date.now() }),
      order({ id: 'o2', number: 6, customerId: 'c1', deletedAt: Date.now() }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(screen.getByRole('button', { name: 'Очистить корзину' }))

    // The confirm spells out the count and the finality; nothing deleted yet.
    const dialog = await screen.findByRole('dialog', { name: 'Очистить корзину?' })
    expect(within(dialog).getByText(/2 заказа будут удалены безвозвратно/)).toBeInTheDocument()
    expect(hardDeleteOrders).not.toHaveBeenCalled()

    // Cancelling keeps the trash intact.
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(hardDeleteOrders).not.toHaveBeenCalled()

    // Confirming deletes EVERY trashed order (the full trash, not a filtered view).
    await user.click(screen.getByRole('button', { name: 'Очистить корзину' }))
    const dialog2 = await screen.findByRole('dialog', { name: 'Очистить корзину?' })
    await user.click(within(dialog2).getByRole('button', { name: 'Удалить всё' }))
    expect(hardDeleteOrders).toHaveBeenCalledWith(['o1', 'o2'])
  })

  it('surfaces a visible error when the empty-trash batch is rejected', async () => {
    // The app's one irreversible action must not fail silently: a rejected
    // commit (permission/quota) shows an alert and the list re-syncs, instead
    // of a lying empty screen with the failure known only to Sentry.
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([
      order({ id: 'o1', number: 5, customerId: 'c1', deletedAt: Date.now() }),
    ])
    hardDeleteOrders.mockRejectedValue(new Error('permission-denied'))
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(screen.getByRole('button', { name: 'Очистить корзину' }))
    const dialog = await screen.findByRole('dialog', { name: 'Очистить корзину?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить всё' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось очистить корзину')
  })

  it('shows no empty-trash button when the trash is empty', async () => {
    fetchDeletedOrders.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Очистить корзину' })).not.toBeInTheDocument()
  })

  it('shows a fixed "these are deleted" banner when the trash has orders', async () => {
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5 })])
    renderPage()
    await screen.findByTestId('orders-table')
    expect(screen.getByText(/Корзина — эти заказы удалены/)).toBeInTheDocument()
  })

  it('shows an empty state (and no banner) when the trash is empty', async () => {
    fetchDeletedOrders.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument()
    // No deleted orders → the page-label banner is not shown.
    expect(screen.queryByText(/Корзина — эти заказы удалены/)).not.toBeInTheDocument()
  })

  it('opens the order detail page when a trash row is clicked', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5, customerId: 'c1' })])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(table().getAllByRole('link')[0])
    expect(navigate).toHaveBeenCalledWith('/orders/o1')
  })

  it('narrows the trash to orders matching the search (by number or customer)', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([
      order({ id: 'o1', number: 5, customerId: 'c1' }),
      order({ id: 'o2', number: 6, customerId: 'c2' }),
    ])
    fetchCustomers.mockResolvedValue([
      customer({ id: 'c1', name: 'Анна' }),
      customer({ id: 'c2', name: 'Борис' }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    // The search box is collapsed behind a loupe; click it to reveal the input.
    await user.click(await header().findByRole('button', { name: 'Поиск' }))
    await user.type(header().getByRole('textbox', { name: 'Поиск в корзине' }), 'Борис')

    expect(table().getByText('Борис')).toBeInTheDocument()
    expect(table().queryByText('Анна')).not.toBeInTheDocument()
  })

  it('filters the trash by order status from the filter dialog (same as the active list)', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([
      order({ id: 'o1', number: 5, customerId: 'c1', status: 'processing' }),
      order({ id: 'o2', number: 6, customerId: 'c2', status: 'delivered' }),
    ])
    fetchCustomers.mockResolvedValue([
      customer({ id: 'c1', name: 'Анна' }),
      customer({ id: 'c2', name: 'Борис' }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(await header().findByRole('button', { name: 'Фильтры' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус заказа' }), 'delivered')
    await user.click(screen.getByRole('button', { name: 'Готово' }))

    // Only the delivered order remains.
    expect(table().getByText('Борис')).toBeInTheDocument()
    expect(table().queryByText('Анна')).not.toBeInTheDocument()
  })

  it('shows a "nothing found" message when the search matches no trashed order', async () => {
    const user = userEvent.setup()
    fetchDeletedOrders.mockResolvedValue([order({ id: 'o1', number: 5 })])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(await header().findByRole('button', { name: 'Поиск' }))
    await user.type(header().getByRole('textbox', { name: 'Поиск в корзине' }), 'нет такого')

    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
  })
})
