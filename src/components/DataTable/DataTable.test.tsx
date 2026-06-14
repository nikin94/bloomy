import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DataTable from './DataTable'
import { buildOrderColumns } from '../../types/order'
import type { Order } from '../../types/order'

// Real column config (resolving the customer name via a lookup, as OrdersPage
// does) so the test exercises the same OrderColumn → TanStack adapter the app uses.
const columns = buildOrderColumns((id) => (id === 'c1' ? 'Анна' : '—'))

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  number: 1,
  dateCreated: 1700000000000,
  ownerId: 'owner-1',
  customerId: 'c1',
  address: 'Main St 1',
  plants: [{ name: 'Роза', quantity: 2, unitPriceMinor: 15000 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
  ...over,
})

describe('DataTable', () => {
  it('renders the configured column headers', () => {
    render(<DataTable orders={[order()]} columns={columns} onRowClick={vi.fn()} />)
    expect(screen.getByText('№')).toBeInTheDocument()
    expect(screen.getByText('Клиент')).toBeInTheDocument()
    expect(screen.getByText('Сумма')).toBeInTheDocument()
  })

  it('renders a row with resolved and formatted cell values', () => {
    render(<DataTable orders={[order()]} columns={columns} onRowClick={vi.fn()} />)
    expect(screen.getByText('Анна')).toBeInTheDocument() // customer resolved via the lookup
    expect(screen.getByText('Роза')).toBeInTheDocument() // plant name from the format fn
  })

  it('shows an empty state when there are no orders', () => {
    render(<DataTable orders={[]} columns={columns} onRowClick={vi.fn()} />)
    expect(screen.getByText('Заказов пока нет')).toBeInTheDocument()
  })

  it('calls onRowClick with the row order when a row is clicked', async () => {
    const onRowClick = vi.fn()
    render(<DataTable orders={[order()]} columns={columns} onRowClick={onRowClick} />)
    await userEvent.click(screen.getByText('Анна'))
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
  })

  it('triggers onRowClick on Enter for keyboard users', async () => {
    const onRowClick = vi.fn()
    render(<DataTable orders={[order()]} columns={columns} onRowClick={onRowClick} />)
    const row = screen.getByRole('link')
    row.focus()
    await userEvent.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
  })
})
