import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { QueryWrapper } from '@/test/queryWrapper'
import { AuthContext } from '@/context/authContext'
import AppLayout from '@/components/AppLayout/AppLayout'
import type { Order } from '@/types/order'
import type { Customer } from '@/types/customer'
import { order as baseOrder, customer as baseCustomer } from '@/test/factories'

// Firebase-touching modules are mocked so the page never initializes the real
// SDK. We test the filter behaviour (search + status) over an in-memory list.
const fetchOrders = vi.fn()
const reconcileOrderNumbers = vi.fn()
const fetchCustomers = vi.fn()

vi.mock('../../firebase/orders', () => ({
  fetchOrders: (...a: unknown[]) => fetchOrders(...a),
  reconcileOrderNumbers: (...a: unknown[]) => reconcileOrderNumbers(...a),
  // The lazy status migration fires on the list mount; a no-op here (nothing
  // legacy in the fixtures) so it never touches the mocked Firestore.
  migrateOrderStatuses: vi.fn().mockResolvedValue(false),
}))
vi.mock('../../firebase/customers', () => ({ fetchCustomers: (...a: unknown[]) => fetchCustomers(...a) }))
// Sidebar imports signOutUser from here; stub it so firebase stays untouched.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))

// Imported after the mocks above are registered.
import OrdersPage from './OrdersPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

// Same observable defaults as before consolidation: this page pairs an order
// with a `c-anna` customer (so the list resolves the customer name), a real
// timestamp, a street address, and a Роза×1 @10₽ line.
const order = (over: Partial<Order> = {}): Order =>
  baseOrder({
    dateCreated: 1700000000000,
    customerId: 'c-anna',
    address: 'ул. Пушкина, 1',
    plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 1000 }],
    ...over,
  })

const customer = (over: Partial<Customer> = {}): Customer =>
  baseCustomer({ id: 'c-anna', ...over })

// The header now lives in AppLayout (above the page in the route tree), and the
// page publishes its search + filter controls into it via the header-actions
// slot — so the page is mounted inside AppLayout here, as in the app, for the
// header and its actions to render.
const renderPage = () =>
  render(
    <QueryWrapper>
      <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="*" element={<OrdersPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryWrapper>,
  )

// The desktop table and mobile cards both render in jsdom; scope to one layout.
const table = () => within(screen.getByTestId('orders-table'))
// The search/filter actions render in both the desktop header and the mobile
// bar (jsdom applies no CSS), so scope action queries to the desktop header.
const header = () => within(screen.getByTestId('sidebar-desktop'))

// The search input is collapsed behind a loupe; click it to reveal the input.
// findByRole (not getByRole) for the loupe: the page publishes its header controls
// once its data resolves out of Suspense, a tick after the table appears, so the
// first reach into the header slot must await them.
const openSearch = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await header().findByRole('button', { name: 'Поиск' }))
  return header().getByRole('textbox', { name: 'Поиск заказов' })
}

beforeEach(() => {
  vi.clearAllMocks()
  // No offline orders to number by default — the page reconciles before fetching.
  reconcileOrderNumbers.mockResolvedValue(false)
  fetchCustomers.mockResolvedValue([
    customer({ id: 'c-anna', name: 'Анна' }),
    customer({ id: 'c-boris', name: 'Борис' }),
  ])
  fetchOrders.mockResolvedValue([
    order({ id: 'o1', number: 1, customerId: 'c-anna', shipmentStatus: 'processing' }),
    order({ id: 'o2', number: 2, customerId: 'c-boris', shipmentStatus: 'delivered' }),
  ])
})

describe('OrdersPage filtering', () => {
  it('narrows the list to orders matching the search query (by customer name)', async () => {
    const user = userEvent.setup()
    renderPage()
    // Wait for the async load, then both orders are listed.
    await screen.findByTestId('orders-table')
    expect(table().getByText('Анна')).toBeInTheDocument()
    expect(table().getByText('Борис')).toBeInTheDocument()

    // The search box is collapsed (inert, behind the loupe) until it's opened.
    expect(await header().findByRole('button', { name: 'Поиск' })).toBeInTheDocument()
    expect(header().getByRole('textbox', { name: 'Поиск заказов' })).toHaveAttribute('inert')
    await user.type(await openSearch(user), 'Борис')

    expect(table().queryByText('Анна')).not.toBeInTheDocument()
    expect(table().getByText('Борис')).toBeInTheDocument()
  })

  it('hides the loupe while open and closes + clears via the X button', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('orders-table')

    const input = await openSearch(user)
    await user.type(input, 'Борис')
    // The loupe is replaced by the input + an X while the search is open.
    expect(header().queryByRole('button', { name: 'Поиск' })).not.toBeInTheDocument()
    expect(table().queryByText('Анна')).not.toBeInTheDocument()

    // X clears the query and collapses back to the loupe. The loupe is revealed
    // only after the collapse animation finishes, so wait for it to reappear.
    await user.click(header().getByRole('button', { name: 'Очистить и закрыть поиск' }))
    expect(await header().findByRole('button', { name: 'Поиск' })).toBeInTheDocument()
    // The field collapses back to inert (hidden behind the loupe).
    expect(header().getByRole('textbox', { name: 'Поиск заказов' })).toHaveAttribute('inert')
    // The list is unfiltered again.
    expect(table().getByText('Анна')).toBeInTheDocument()
    expect(table().getByText('Борис')).toBeInTheDocument()
  })

  it('matches the search against plant names too', async () => {
    const user = userEvent.setup()
    fetchOrders.mockResolvedValue([
      order({ id: 'o1', customerId: 'c-anna', plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 1000 }] }),
      order({ id: 'o2', customerId: 'c-boris', plants: [{ name: 'Пион', quantity: 1, unitPriceMinor: 1000 }] }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.type(await openSearch(user), 'пион')

    // Only the order containing a Пион remains (Борис's), found by plant name.
    expect(table().getByText('Борис')).toBeInTheDocument()
    expect(table().queryByText('Анна')).not.toBeInTheDocument()
  })

  it('filters by order status, chosen in the filter dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('orders-table')

    // The status filters live behind the filter icon, not inline.
    expect(screen.queryByRole('combobox', { name: 'Статус заказа' })).not.toBeInTheDocument()
    await user.click(await header().findByRole('button', { name: 'Фильтры' }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Статус заказа' }),
      'delivered',
    )
    // Close the dialog to see the filtered list.
    await user.click(screen.getByRole('button', { name: 'Готово' }))

    // Only the delivered order (Борис) remains.
    expect(table().getByText('Борис')).toBeInTheDocument()
    expect(table().queryByText('Анна')).not.toBeInTheDocument()
  })

  it('resets the status filters from the dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(await header().findByRole('button', { name: 'Фильтры' }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Статус заказа' }),
      'delivered',
    )
    await user.click(screen.getByRole('button', { name: 'Сбросить' }))
    await user.click(screen.getByRole('button', { name: 'Готово' }))

    // Both orders are back once the status filter is cleared.
    expect(table().getByText('Анна')).toBeInTheDocument()
    expect(table().getByText('Борис')).toBeInTheDocument()
  })

  it('fills in the filter button while a dialog filter is active', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('orders-table')

    // Inactive: outlined (secondary) and not pressed. Await the first reach into
    // the header slot (published a tick after the table resolves out of Suspense).
    await header().findByRole('button', { name: 'Фильтры' })
    const filterBtn = () => header().getByRole('button', { name: 'Фильтры' })
    expect(filterBtn()).toHaveAttribute('aria-pressed', 'false')
    expect(filterBtn()).not.toHaveClass('bg-primary')

    await user.click(filterBtn())
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Статус заказа' }),
      'delivered',
    )
    await user.click(screen.getByRole('button', { name: 'Готово' }))

    // Active: the whole button fills in (primary) and reports the pressed state.
    expect(filterBtn()).toHaveAttribute('aria-pressed', 'true')
    expect(filterBtn()).toHaveClass('bg-primary')
  })

  it('shows a price range slider spanning 0…ceiling when orders differ in price', async () => {
    const user = userEvent.setup()
    fetchOrders.mockResolvedValue([
      order({ id: 'o1', plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 100000 }] }), // 1000 ₽
      order({ id: 'o2', plants: [{ name: 'Пион', quantity: 1, unitPriceMinor: 500000 }] }), // 5000 ₽ — ceiling
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(await header().findByRole('button', { name: 'Фильтры' }))
    // The range renders as a single track with a "from"/"to" thumb pair; the
    // summary shows the full span until the user narrows it. (The thumb value +
    // clamping logic is covered by RangeSlider's own unit tests; the
    // price-filtering itself by filterOrders'.)
    expect(screen.getByText('Сумма заказа')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Минимальная сумма' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Максимальная сумма' })).toBeInTheDocument()
  })

  it('scopes the price slider summary to the filtered currency, not the default', async () => {
    const user = userEvent.setup()
    fetchOrders.mockResolvedValue([
      // RUB order is huge in minor units (10 000 ₽); a USD order is small ($200).
      // The slider must not mix the two scales: once USD is picked, the ceiling
      // and the symbol both follow USD, never the (default) RUB.
      order({ id: 'o1', currency: 'RUB', plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 1000000 }] }),
      order({ id: 'o2', currency: 'USD', plants: [{ name: 'Пион', quantity: 1, unitPriceMinor: 20000 }] }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(await header().findByRole('button', { name: 'Фильтры' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Валюта' }), 'USD')

    // The "from – to" summary now reads in dollars, and its ceiling is the
    // USD-only max ($200) — not the cross-currency RUB total.
    const summary = screen.getByText((text) => text.includes('–'))
    expect(summary.textContent).toContain('$')
    expect(summary.textContent).toContain('200')
    expect(summary.textContent).not.toContain('₽')
  })

  it('hides the price slider when there is no range to pick (all totals zero)', async () => {
    const user = userEvent.setup()
    fetchOrders.mockResolvedValue([
      order({ id: 'o1', plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 0 }], deliveryPriceMinor: 0 }),
    ])
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(await header().findByRole('button', { name: 'Фильтры' }))
    // The ceiling is 0, so the price section is omitted — the status filters
    // remain.
    expect(screen.queryByText('Сумма заказа')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Статус оплаты' })).toBeInTheDocument()
  })

  it('shows a "nothing found" message when the filter matches no orders', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('orders-table')

    await user.type(await openSearch(user), 'нет такого')

    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
    expect(screen.queryByTestId('orders-table')).not.toBeInTheDocument()
  })
})

describe('OrdersPage offline numbering', () => {
  it('renders the list from cache even when numbering never settles (offline)', async () => {
    // Offline, reconcileOrderNumbers' transaction never settles. The list must
    // still render (from the cache) instead of hanging on the spinner forever,
    // so the render is NOT gated on reconcile.
    reconcileOrderNumbers.mockReturnValue(new Promise(() => {}))

    renderPage()

    expect(await screen.findByTestId('orders-table')).toBeInTheDocument()
    expect(table().getByText('Анна')).toBeInTheDocument()
  })

  it('fills in the № live when connectivity returns, without a reload', async () => {
    // An order created offline has no number yet — the table shows "—".
    reconcileOrderNumbers.mockResolvedValue(false)
    fetchOrders.mockResolvedValue([order({ id: 'o1', number: null, customerId: 'c-anna' })])

    renderPage()
    const tbl = await screen.findByTestId('orders-table')
    expect(within(tbl).getByText('—')).toBeInTheDocument()

    // Reconnecting numbers the order and the background reload returns the real
    // №, so the cell updates in place — no manual page reload.
    reconcileOrderNumbers.mockResolvedValue(true)
    fetchOrders.mockResolvedValue([order({ id: 'o1', number: 7, customerId: 'c-anna' })])
    window.dispatchEvent(new Event('online'))

    await within(tbl).findByText('7')
    expect(within(tbl).queryByText('—')).not.toBeInTheDocument()
  })

  it('seeds the date filter from navigation state (a clicked month on the stats tab)', async () => {
    // June 2026 orders vs a January 2026 one; the incoming state scopes to June.
    const jun = new Date(2026, 5, 15).getTime()
    const jan = new Date(2026, 0, 10).getTime()
    fetchOrders.mockResolvedValue([
      order({ id: 'jun', number: 1, customerId: 'c-anna', dateCreated: jun }),
      order({ id: 'jan', number: 2, customerId: 'c-boris', dateCreated: jan }),
    ])
    render(
      <QueryWrapper>
        <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
          <MemoryRouter
            initialEntries={[
              {
                pathname: '/orders',
                state: {
                  dateFilter: {
                    minDate: new Date(2026, 5, 1, 0, 0, 0, 0).getTime(),
                    maxDate: new Date(2026, 5, 30, 23, 59, 59, 999).getTime(),
                  },
                },
              },
            ]}
          >
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="*" element={<OrdersPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryWrapper>,
    )

    await screen.findByTestId('orders-table')
    // Only the June order shows; the January one is filtered out on first render.
    expect(table().getByText('Анна')).toBeInTheDocument()
    expect(table().queryByText('Борис')).not.toBeInTheDocument()
    // The date bound is a dialog filter, so the funnel button reads as active.
    expect(await header().findByRole('button', { name: 'Фильтры' })).toHaveClass('bg-primary')
  })
})
