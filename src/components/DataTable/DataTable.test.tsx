import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

// Both the desktop table and the mobile cards render in jsdom (CSS visibility is
// not applied), so scope queries to one layout to avoid duplicate-match errors.
const table = () => within(screen.getByTestId('orders-table'))
const cards = () => within(screen.getByTestId('orders-cards'))

describe('DataTable (table layout)', () => {
  it('renders the configured column headers', () => {
    render(<DataTable orders={[order()]} columns={columns} onRowClick={vi.fn()} />)
    expect(table().getByText('№')).toBeInTheDocument()
    expect(table().getByText('Клиент')).toBeInTheDocument()
    expect(table().getByText('Сумма')).toBeInTheDocument()
  })

  it('renders a row with resolved and formatted cell values', () => {
    render(<DataTable orders={[order()]} columns={columns} onRowClick={vi.fn()} />)
    expect(table().getByText('Анна')).toBeInTheDocument() // customer resolved via the lookup
    // Plant lines are stacked "name ×qty"; one row per plant.
    expect(table().getByText('Роза ×2')).toBeInTheDocument()
  })

  it('stacks plants priciest-first, hiding the quantity when it is 1', () => {
    const multi = order({
      plants: [
        { name: 'Роза', quantity: 2, unitPriceMinor: 15000 }, // line value 30000
        { name: 'Фикус', quantity: 1, unitPriceMinor: 50000 }, // line value 50000 — pricier
      ],
    })
    render(<DataTable orders={[multi]} columns={columns} onRowClick={vi.fn()} />)
    // Stacked, not "Роза, Фикус". Quantity shows only above 1: "Роза ×2",
    // but a single Фикус is just its name.
    const rose = table().getByText('Роза ×2')
    const ficus = table().getByText('Фикус')
    // The most valuable line (Фикус, 50000) is listed before the cheaper Роза.
    expect(ficus.compareDocumentPosition(rose) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('calls onRowClick with the row order when a row is clicked', async () => {
    const onRowClick = vi.fn()
    render(<DataTable orders={[order()]} columns={columns} onRowClick={onRowClick} />)
    await userEvent.click(table().getByText('Анна'))
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
  })

  it('triggers onRowClick on Enter for keyboard users', async () => {
    const onRowClick = vi.fn()
    render(<DataTable orders={[order()]} columns={columns} onRowClick={onRowClick} />)
    const row = table().getByRole('link')
    row.focus()
    await userEvent.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
  })

  it('triggers onRowClick on Space for keyboard users', async () => {
    const onRowClick = vi.fn()
    render(<DataTable orders={[order()]} columns={columns} onRowClick={onRowClick} />)
    const row = table().getByRole('link')
    row.focus()
    await userEvent.keyboard(' ')
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
  })

  it('marks only the highlighted order row for the new-order animation', () => {
    render(
      <DataTable
        orders={[order({ id: 'o1' }), order({ id: 'o2', number: 2, customerId: 'c2' })]}
        columns={columns}
        onRowClick={vi.fn()}
        highlightOrderId="o2"
      />,
    )
    const [first, second] = table().getAllByRole('link')
    expect(first).not.toHaveClass('row-highlight')
    expect(second).toHaveClass('row-highlight')
  })

  it('marks no row when there is nothing to highlight', () => {
    render(<DataTable orders={[order()]} columns={columns} onRowClick={vi.fn()} />)
    expect(table().getByRole('link')).not.toHaveClass('row-highlight')
  })
})

describe('DataTable (mobile card layout)', () => {
  it('renders one clickable card per order with label/value pairs', () => {
    render(<DataTable orders={[order()]} columns={columns} onRowClick={vi.fn()} />)
    const card = cards().getByRole('link')
    // Each column shows up as a "label → value" pair inside the card.
    expect(within(card).getByText('Клиент')).toBeInTheDocument()
    expect(within(card).getByText('Анна')).toBeInTheDocument()
    expect(within(card).getByText('Роза ×2')).toBeInTheDocument()
  })

  it('activates a card with a click and with the keyboard', async () => {
    const onRowClick = vi.fn()
    render(<DataTable orders={[order()]} columns={columns} onRowClick={onRowClick} />)
    const card = cards().getByRole('link')

    await userEvent.click(card)
    card.focus()
    await userEvent.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledTimes(2)
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
  })

  it('highlights only the matching card for the new-order animation', () => {
    render(
      <DataTable
        orders={[order({ id: 'o1' }), order({ id: 'o2', number: 2, customerId: 'c2' })]}
        columns={columns}
        onRowClick={vi.fn()}
        highlightOrderId="o2"
      />,
    )
    const [first, second] = cards().getAllByRole('link')
    expect(first).not.toHaveClass('row-highlight')
    expect(second).toHaveClass('row-highlight')
  })
})

describe('DataTable (shared)', () => {
  it('shows a single empty state when there are no orders', () => {
    render(<DataTable orders={[]} columns={columns} onRowClick={vi.fn()} />)
    expect(screen.getByText('Заказов пока нет')).toBeInTheDocument()
  })
})
