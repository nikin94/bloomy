import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { QueryWrapper } from '@/test/queryWrapper'
import { renderPageInLayout } from '@/test/renderPageInLayout'
import { AuthContext } from '@/context/authContext'
import type { Order } from '@/types/order'
import { formatDate } from '@/utils/format'
import { order as baseOrder, customer } from '@/test/factories'

// Firebase-touching modules are mocked so the page never initializes the real
// SDK. We test the page render, the derived stats, and the order list — not
// Firestore.
const fetchCustomer = vi.fn()
const updateCustomer = vi.fn()
const fetchOrders = vi.fn()
const navigate = vi.fn()

vi.mock('../../firebase/customers', () => ({
  fetchCustomer: (...args: unknown[]) => fetchCustomer(...args),
  updateCustomer: (...args: unknown[]) => updateCustomer(...args),
}))
vi.mock('../../firebase/orders', () => ({
  fetchOrders: (...args: unknown[]) => fetchOrders(...args),
}))
// Stub signOutUser so the real Firebase SDK stays out of the test.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ id: 'c1' }),
  useNavigate: () => navigate,
}))

// Imported after the mocks above are registered.
import CustomerPage from './CustomerPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

// Same observable defaults as before consolidation: a PAID order with a real
// timestamp, a street address, and a Кактус×1 @500₽ line (the page's per-customer
// stats sum these).
const order = (over: Partial<Order> = {}): Order =>
  baseOrder({
    dateCreated: 1700000000000,
    address: 'ул. Пушкина, 1',
    plants: [{ name: 'Кактус', quantity: 1, unitPriceMinor: 50000 }],
    paymentStatus: 'paid',
    ...over,
  })

const renderPage = () =>
  render(
    <QueryWrapper>
      <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
        <MemoryRouter>
          <CustomerPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryWrapper>,
  )

// The DataTable renders both desktop table and mobile cards in jsdom; scope to one.
const table = () => within(screen.getByTestId('orders-table'))

beforeEach(() => {
  vi.clearAllMocks()
  fetchCustomer.mockResolvedValue(customer())
  fetchOrders.mockResolvedValue([])
  updateCustomer.mockResolvedValue(undefined)
})

describe('CustomerPage', () => {
  it('shows the customer name and contact details', async () => {
    fetchCustomer.mockResolvedValue(
      customer({ phone: '+7 900 111-22-33', address: 'ул. Лесная, 8', note: 'любит кактусы' }),
    )
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Анна' })).toBeInTheDocument()
    expect(screen.getByText('+7 900 111-22-33')).toBeInTheDocument()
    expect(screen.getByText('ул. Лесная, 8')).toBeInTheDocument()
    expect(screen.getByText('любит кактусы')).toBeInTheDocument()
  })

  it('publishes the masked customer name into the mobile top bar (in-layout)', async () => {
    // Mounted inside AppLayout: the page names the bar via the shared
    // usePageHeaderTitle hook. TWO headings with the name end up in the tree —
    // the bar's (phones) and the content's (desktop, max-md:hidden) — CSS
    // decides which shows; jsdom keeps both. BOTH carry data-sentry-mask: the
    // name is PII wherever it renders.
    renderPageInLayout(<CustomerPage />)
    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'Анна' })).toHaveLength(2))
    for (const heading of screen.getAllByRole('heading', { name: 'Анна' })) {
      expect(heading).toHaveAttribute('data-sentry-mask')
    }
  })

  it('derives order count, paid revenue per currency, and frequent plants', async () => {
    fetchOrders.mockResolvedValue([
      order({ id: 'o1', currency: 'RUB', paymentStatus: 'paid', plants: [{ name: 'Кактус', quantity: 2, unitPriceMinor: 50000 }] }),
      order({ id: 'o2', currency: 'USD', paymentStatus: 'paid', plants: [{ name: 'Фиалка', quantity: 1, unitPriceMinor: 3000 }] }),
      // Pending: counts as an order but NOT toward revenue.
      order({ id: 'o3', currency: 'RUB', paymentStatus: 'pending', plants: [{ name: 'Кактус', quantity: 5, unitPriceMinor: 99900 }] }),
    ])
    renderPage()
    await screen.findByRole('heading', { name: 'Анна' })

    // 3 orders total.
    expect(screen.getByText('Всего заказов')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    // Paid revenue shown per currency (RUB 1000,00 ₽ and USD separately); the
    // pending RUB order's 4995,00 ₽ is excluded. Scope to the revenue row — the
    // same amount also appears as that order's total in the list below.
    const revenueRow = screen.getByText('Выручка (оплачено)').closest('div') as HTMLElement
    expect(within(revenueRow).getByText(/1\s?000/)).toBeInTheDocument()
    // Frequent plants: Кактус leads by quantity (2 from the paid + 5 from pending = 7).
    expect(screen.getByText('Частые растения')).toBeInTheDocument()
    expect(screen.getByText('×7')).toBeInTheDocument()
  })

  it('lists the customer orders and opens one on row click', async () => {
    const user = userEvent.setup()
    fetchOrders.mockResolvedValue([order({ id: 'o1', number: 7 })])
    renderPage()
    await screen.findByRole('heading', { name: 'Анна' })

    expect(table().getByText('7')).toBeInTheDocument()
    await user.click(table().getAllByRole('link')[0])
    expect(navigate).toHaveBeenCalledWith('/orders/o1')
  })

  it('shows an empty-orders message when the customer has no orders', async () => {
    fetchOrders.mockResolvedValue([])
    renderPage()
    await screen.findByRole('heading', { name: 'Анна' })
    expect(screen.getByText('У клиента пока нет заказов')).toBeInTheDocument()
  })

  it('lists every gift sent to this customer with its giving date, newest first', async () => {
    // 22 Jun 2026 / 1 Jul 2026 / 5 Jul 2026 (local) — distinct formatted dates.
    const jun22 = new Date(2026, 5, 22).getTime()
    const jul1 = new Date(2026, 6, 1).getTime()
    const jul5 = new Date(2026, 6, 5).getTime()
    fetchOrders.mockResolvedValue([
      order({ id: 'o1', dateCreated: jun22, gifts: [{ name: 'Азалия', quantity: 1, unitPriceMinor: 0 }] }),
      // The SAME gift again in another order — two separate rows, told apart by date.
      order({ id: 'o2', number: 2, dateCreated: jul5, gifts: [{ name: 'Азалия', quantity: 1, unitPriceMinor: 0 }] }),
      order({ id: 'o3', number: 3, dateCreated: jul1, gifts: [{ name: 'Бегония', quantity: 1, unitPriceMinor: 0 }] }),
    ])
    renderPage()
    await screen.findByRole('heading', { name: 'Анна' })

    // Scope to the gifts section — plant names also appear in the orders table.
    const gifts = within(screen.getByText('Подарки').closest('section') as HTMLElement)
    // Each giving is its own row (no dedupe), with the order's date beside it.
    expect(gifts.getAllByText('Азалия')).toHaveLength(2)
    expect(gifts.getByText(formatDate(jun22))).toBeInTheDocument()
    expect(gifts.getByText(formatDate(jul5))).toBeInTheDocument()
    expect(gifts.getByText(formatDate(jul1))).toBeInTheDocument()
    // Newest first: the 5 Jul giving is listed above the 22 Jun one.
    const rows = gifts.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent(formatDate(jul5))
    expect(rows[1]).toHaveTextContent(formatDate(jul1))
    expect(rows[2]).toHaveTextContent(formatDate(jun22))
  })

  it('omits the gifts section when no order carried a gift', async () => {
    fetchOrders.mockResolvedValue([order({ id: 'o1' })])
    renderPage()
    await screen.findByRole('heading', { name: 'Анна' })
    expect(screen.queryByText('Подарки')).not.toBeInTheDocument()
  })

  it('treats a foreign customer as not found (defense-in-depth)', async () => {
    fetchCustomer.mockResolvedValue(customer({ ownerId: 'someone-else' }))
    renderPage()
    expect(await screen.findByText('Клиент не найден')).toBeInTheDocument()
  })

  it('edits the customer in a dialog and reflects the new name live', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Анна' })

    // Two edit controls share the "Редактировать" name — a compact pencil icon
    // (mobile) and the full text button (sm+); jsdom applies no media queries so
    // both render. Either opens the same dialog; click the first.
    await user.click(screen.getAllByRole('button', { name: 'Редактировать' })[0])
    const dialog = await screen.findByRole('dialog')
    const nameField = within(dialog).getByLabelText('Имя клиента')
    await user.clear(nameField)
    await user.type(nameField, 'Анна Петрова')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'Анна Петрова' })))
    // The heading reflects the new name without a refetch.
    expect(await screen.findByRole('heading', { name: 'Анна Петрова' })).toBeInTheDocument()
  })

  it('offers both responsive edit controls (pencil on mobile, text button sm+)', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Анна' })
    // Both variants render (jsdom has no media queries); CSS shows one per width.
    // Same accessible name so either is reachable as "Редактировать".
    expect(screen.getAllByRole('button', { name: 'Редактировать' })).toHaveLength(2)
  })
})
