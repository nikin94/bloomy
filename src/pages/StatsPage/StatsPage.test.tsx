import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import { formatMoney } from '../../utils/format'
import type { Order } from '../../types/order'

// Firebase is mocked so the page never touches the real SDK. We test the derived
// KPIs, the period selector, and the empty state — not Firestore.
const fetchOrders = vi.fn()

vi.mock('../../firebase/orders', () => ({
  fetchOrders: (...args: unknown[]) => fetchOrders(...args),
}))

// Imported after the mock above is registered.
import StatsPage from './StatsPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

const DAY = 24 * 60 * 60 * 1000

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  number: 1,
  dateCreated: Date.now(),
  ownerId: 'owner-1',
  customerId: 'c1',
  address: 'ул. Пушкина, 1',
  plants: [{ name: 'Кактус', quantity: 1, unitPriceMinor: 100000 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'paid',
  shipmentStatus: 'new',
  ...over,
})

const renderPage = () =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <MemoryRouter>
        <StatsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

// The total-orders KPI card holds the count next to its label; scope to it so the
// number isn't confused with the same digit in the chart/legend.
const totalCount = () => within(screen.getByText('Заказов за период').parentElement as HTMLElement)

// yyyy-mm-dd (local), matching what <input type="date"> holds — for driving the
// custom-range fields.
const ymd = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchOrders.mockResolvedValue([])
})

describe('StatsPage', () => {
  it('shows an empty state when the owner has no orders', async () => {
    renderPage()
    expect(await screen.findByText('Пока нет заказов для статистики')).toBeInTheDocument()
    // No period selector when there's nothing to scope.
    expect(screen.queryByRole('combobox', { name: 'Период статистики' })).not.toBeInTheDocument()
  })

  it('renders KPIs, the status breakdown, and the monthly chart for the current period', async () => {
    fetchOrders.mockResolvedValue([
      order({ id: 'a', dateCreated: Date.now(), paymentStatus: 'paid', shipmentStatus: 'delivered' }),
    ])
    renderPage()

    // Default period is "this month" → the one current-month order counts.
    await screen.findByText('Заказов за период')
    expect(totalCount().getByText('1')).toBeInTheDocument()
    // Money + status + chart sections are present.
    expect(screen.getByText('Растения')).toBeInTheDocument()
    expect(screen.getByText('Итого')).toBeInTheDocument()
    expect(screen.getByText('Статусы заказов')).toBeInTheDocument()
    expect(screen.getByText('Доставлено')).toBeInTheDocument()
    expect(screen.getByText('Заказы по месяцам')).toBeInTheDocument()
  })

  it('splits paid money into plants, delivery, and their total', async () => {
    // plants = 1 × 1000.00, delivery = 250.00 → total = 1250.00. The total must
    // equal plants + delivery (revenue already includes delivery), so the three
    // rows never read as if delivery is added on top of the total.
    fetchOrders.mockResolvedValue([
      order({
        id: 'a',
        dateCreated: Date.now(),
        paymentStatus: 'paid',
        plants: [{ name: 'Кактус', quantity: 1, unitPriceMinor: 100000 }],
        deliveryPriceMinor: 25000,
      }),
    ])
    renderPage()

    await screen.findByText('Растения')
    // getByText collapses non-breaking spaces (U+00A0) in the DOM to regular
    // spaces, so normalise the expected formatted amount to match.
    const money = (minor: number) => formatMoney(minor, 'RUB').replace(/\s/g, ' ')
    expect(screen.getByText(money(100000))).toBeInTheDocument()
    expect(screen.getByText(money(25000))).toBeInTheDocument()
    expect(screen.getByText(money(125000))).toBeInTheDocument()
  })

  it('rescopes the KPIs when the period preset changes', async () => {
    fetchOrders.mockResolvedValue([
      order({ id: 'now', dateCreated: Date.now() }),
      // ~400 days ago → outside both this month and this year.
      order({ id: 'old', dateCreated: Date.now() - 400 * DAY }),
    ])
    const user = userEvent.setup()
    renderPage()

    // "This month" (default) sees only the recent order.
    await screen.findByText('Заказов за период')
    expect(totalCount().getByText('1')).toBeInTheDocument()

    // "All time" includes the year-old one too.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Период статистики' }), 'Всё время')
    expect(totalCount().getByText('2')).toBeInTheDocument()
  })

  it('scopes the KPIs to a custom date range', async () => {
    fetchOrders.mockResolvedValue([
      order({ id: 'now', dateCreated: Date.now() }),
      order({ id: 'old', dateCreated: Date.now() - 400 * DAY }),
    ])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Заказов за период')

    // Switching to the custom preset reveals the two date fields; empty bounds
    // leave the window fully open, so both orders count.
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Период статистики' }),
      'Произвольный период',
    )
    expect(totalCount().getByText('2')).toBeInTheDocument()

    // A `from` bound in the future excludes every existing order → 0.
    fireEvent.change(screen.getByLabelText('С'), { target: { value: ymd(Date.now() + 2 * DAY) } })
    expect(totalCount().getByText('0')).toBeInTheDocument()
  })
})
