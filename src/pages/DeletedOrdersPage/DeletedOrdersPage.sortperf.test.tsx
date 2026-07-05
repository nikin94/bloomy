import { StrictMode, Profiler } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { QueryWrapper } from '@/test/queryWrapper'
import { AuthContext } from '@/context/authContext'
import AppLayout from '@/components/AppLayout/AppLayout'
import type { Order } from '@/types/order'
import { order as baseOrder, customer } from '@/test/factories'

// Regression guard for the search-close HANG (fixed by memoising DataTable's
// controlled `sorting` reference). The trash/orders lists run DataTable in
// CONTROLLED-sort mode; a fresh `sorting` array every render made TanStack re-sync
// on each render, so the header-actions republish that fires when the search field
// closes cascaded into ~175 table commits — invisible in jsdom (no layout) but a
// multi-second main-thread peg in a real browser on a big list. This mounts the
// page under the real DATA ROUTER (as the app does) and asserts that closing the
// search commits a small, bounded number of times, not a storm.

const fetchDeletedOrders = vi.fn()
const fetchCustomers = vi.fn()
vi.mock('../../firebase/orders', () => ({ fetchDeletedOrders: (...a: unknown[]) => fetchDeletedOrders(...a) }))
vi.mock('../../firebase/customers', () => ({ fetchCustomers: (...a: unknown[]) => fetchCustomers(...a) }))
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))

import DeletedOrdersPage from './DeletedOrdersPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User
// A per-index trashed order (the perf test builds a big list of them). Same
// observable shape as before consolidation.
const order = (i: number): Order =>
  baseOrder({
    id: 'o' + i,
    number: i,
    dateCreated: 1000 + i,
    address: 'Main St ' + i,
    isDeleted: true,
  })

let commits = 0
const renderPage = () => {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          {
            path: '*',
            element: (
              <Profiler id="page" onRender={() => { commits += 1 }}>
                <DeletedOrdersPage />
              </Profiler>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/orders/deleted'] },
  )
  return render(
    <StrictMode>
      <QueryWrapper>
        <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
          <RouterProvider router={router} />
        </AuthContext.Provider>
      </QueryWrapper>
    </StrictMode>,
  )
}
const header = () => within(screen.getByTestId('sidebar-desktop'))

beforeEach(() => {
  vi.clearAllMocks()
  fetchDeletedOrders.mockResolvedValue(Array.from({ length: 40 }, (_, i) => order(i + 1)))
  fetchCustomers.mockResolvedValue([customer()])
})

describe('DeletedOrdersPage — search close does not storm the controlled table', () => {
  it('closing the search commits a bounded number of times, not a cascade', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('orders-table')

    await user.click(await header().findByRole('button', { name: 'Поиск' }))
    const input = await header().findByRole('textbox', { name: 'Поиск в корзине' })
    await user.type(input, 'Анна')

    commits = 0
    await user.click(header().getByRole('button', { name: 'Очистить и закрыть поиск' }))
    await waitFor(() => expect(header().getByRole('button', { name: 'Поиск' })).toBeInTheDocument())

    // Healthy is ~2 commits (StrictMode-doubled); the pre-fix cascade was ~175.
    // A generous ceiling still catches any regression back into a storm.
    expect(commits).toBeLessThan(20)
  })
})
