import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DataTable from './DataTable'
import { buildOrderColumns } from '@/components/DataTable/orderColumns'
import type { Order } from '@/types/order'
import i18n from '@/i18n/config'

// Headers come from the `order` namespace; the shared test i18n defaults to ru,
// so they resolve to the Russian text the assertions below expect.
const t = i18n.getFixedT(null, 'order')

// Real column config (resolving the customer name via a lookup, as OrdersPage
// does) so the test exercises the same OrderColumn → TanStack adapter the app uses.
const columns = buildOrderColumns((id) => (id === 'c1' ? 'Анна' : '—'), t)

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

describe('DataTable (sorting)', () => {
  const sortColumns = buildOrderColumns(
    (id) => (id === 'c-anna' ? 'Анна' : id === 'c-boris' ? 'Борис' : '—'),
    t,
  )
  const renderOrders = (list: Order[]) =>
    render(<DataTable orders={list} columns={sortColumns} onRowClick={vi.fn()} />)

  // The first cell of each row is the "№" column; read it to observe row order.
  const rowNumbers = () =>
    table()
      .getAllByRole('link')
      .map((row) => within(row).getAllByRole('cell')[0].textContent)

  it('sorts a numeric column numerically (not lexically) when its header is clicked', async () => {
    const user = userEvent.setup()
    renderOrders([order({ id: 'a', number: 13 }), order({ id: 'b', number: 2 })])
    // Rows keep their data order until a header is clicked.
    expect(rowNumbers()).toEqual(['13', '2'])

    await user.click(table().getByRole('button', { name: '№' }))
    // First click sorts descending — 13 before 2 by the raw number, NOT a
    // lexical sort of the formatted strings (which would keep "13" before "2"
    // by coincidence here, so the SECOND click is the real numeric check).
    expect(rowNumbers()).toEqual(['13', '2'])

    // Second click flips to ascending — 2 before 13 by the raw number, NOT
    // "13" before "2" (which a lexical string sort would give).
    await user.click(table().getByRole('button', { name: '№' }))
    expect(rowNumbers()).toEqual(['2', '13'])
  })

  it('marks the sorted header with aria-sort and a direction chevron', async () => {
    const user = userEvent.setup()
    renderOrders([order({ id: 'a', number: 1 }), order({ id: 'b', number: 2 })])
    const header = () => table().getByRole('columnheader', { name: /№/ })
    // Sortable but not yet sorted.
    expect(header()).toHaveAttribute('aria-sort', 'none')

    await user.click(table().getByRole('button', { name: '№' }))
    expect(header()).toHaveAttribute('aria-sort', 'descending')
    await user.click(table().getByRole('button', { name: '№' }))
    expect(header()).toHaveAttribute('aria-sort', 'ascending')
  })

  it('sorts the customer column by the resolved name', async () => {
    const user = userEvent.setup()
    renderOrders([
      order({ id: 'b', number: 1, customerId: 'c-boris' }),
      order({ id: 'a', number: 2, customerId: 'c-anna' }),
    ])
    await user.click(table().getByRole('button', { name: 'Клиент' }))
    // First click sorts descending by name: Борис (order 1) before Анна (order 2).
    expect(rowNumbers()).toEqual(['1', '2'])
  })

  it('leaves the multi-line plants column non-sortable (no header button)', () => {
    renderOrders([order()])
    expect(table().queryByRole('button', { name: 'Растения' })).not.toBeInTheDocument()
    expect(table().getByText('Растения')).toBeInTheDocument()
  })

  it('runs controlled: a header click reports the sort and the sort prop drives the order', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()
    const list = [order({ id: 'a', number: 13 }), order({ id: 'b', number: 2 })]
    // Controlled with no sort → natural (data) order, and a header click reports
    // the new sort to the caller (descending first) rather than sorting locally.
    const { rerender } = render(
      <DataTable
        orders={list}
        columns={sortColumns}
        onRowClick={vi.fn()}
        sort={null}
        onSortChange={onSortChange}
      />,
    )
    expect(rowNumbers()).toEqual(['13', '2'])
    await user.click(table().getByRole('button', { name: '№' }))
    expect(onSortChange).toHaveBeenCalledWith({ field: 'number', dir: 'desc' })

    // Driving the sort prop (as the page would from the reported value) orders
    // the rows — ascending puts 2 before 13.
    rerender(
      <DataTable
        orders={list}
        columns={sortColumns}
        onRowClick={vi.fn()}
        sort={{ field: 'number', dir: 'asc' }}
        onSortChange={onSortChange}
      />,
    )
    expect(rowNumbers()).toEqual(['2', '13'])
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

  it('renders each plant as its own block and groups the order details', () => {
    const multi = order({
      number: 7,
      plants: [
        { name: 'Роза', quantity: 2, unitPriceMinor: 15000 },
        { name: 'Фикус', quantity: 1, unitPriceMinor: 50000 },
      ],
    })
    render(<DataTable orders={[multi]} columns={columns} onRowClick={vi.fn()} />)
    const card = cards().getByRole('link')
    // Header carries the number; customer + address are stacked label/value pairs.
    expect(within(card).getByText('Анна')).toBeInTheDocument()
    expect(within(card).getByText('Main St 1')).toBeInTheDocument()
    // Each plant line is its own list item (a bordered block), not one joined string.
    const plantItems = within(card).getAllByRole('listitem')
    expect(plantItems).toHaveLength(2)
    expect(plantItems[0]).toHaveTextContent('Фикус') // priciest line first
    expect(plantItems[1]).toHaveTextContent('Роза ×2')
    // Payment and shipment statuses are both shown.
    expect(within(card).getByText('Оплата')).toBeInTheDocument()
    expect(within(card).getByText('Отправка')).toBeInTheDocument()
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
  it('shows the empty-state message when there are no orders', () => {
    render(
      <DataTable
        orders={[]}
        columns={columns}
        onRowClick={vi.fn()}
        emptyMessage="Заказов пока нет"
      />,
    )
    expect(screen.getByText('Заказов пока нет')).toBeInTheDocument()
  })

  it('falls back to the generic empty message when none is provided', () => {
    render(<DataTable orders={[]} columns={columns} onRowClick={vi.fn()} />)
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
  })
})
