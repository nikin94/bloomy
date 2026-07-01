import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OrderFilterControl from './OrderFilterControl'
import { EMPTY_ORDER_FILTER } from '../../types/order'
import type { Order, OrderFilter } from '../../types/order'

// The shared funnel button + filter dialog used by the orders list and the trash.
// It reads the default currency from settings (the context's default value, RUB)
// and the labels from the `order` namespace (the test i18n defaults to ru), so it
// renders standalone without extra providers.

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  number: 1,
  dateCreated: 0,
  ownerId: 'owner-1',
  customerId: 'c1',
  address: '',
  plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 100000 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
  ...over,
})

// A controlled wrapper so the dialog's onChange round-trips through real state,
// the same way a list page wires it.
const Harness = ({ orders }: { orders: Order[] }) => {
  const [filter, setFilter] = useState<OrderFilter>(EMPTY_ORDER_FILTER)
  return <OrderFilterControl orders={orders} filter={filter} onChange={setFilter} />
}

const funnel = () => screen.getByRole('button', { name: 'Фильтры' })

describe('OrderFilterControl', () => {
  it('opens the dialog and fills the funnel button in when a filter is set', async () => {
    const user = userEvent.setup()
    render(<Harness orders={[order()]} />)

    // Inactive: outlined (secondary), not pressed, dialog closed.
    expect(funnel()).toHaveAttribute('aria-pressed', 'false')
    expect(funnel()).not.toHaveClass('bg-primary')
    expect(screen.queryByRole('combobox', { name: 'Статус отправки' })).not.toBeInTheDocument()

    await user.click(funnel())
    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус отправки' }), 'shipped')
    await user.click(screen.getByRole('button', { name: 'Готово' }))

    // Active: the funnel fills in (primary) and reports the pressed state.
    expect(funnel()).toHaveAttribute('aria-pressed', 'true')
    expect(funnel()).toHaveClass('bg-primary')
  })

  it('clears every dialog filter from Reset', async () => {
    const user = userEvent.setup()
    render(<Harness orders={[order()]} />)

    await user.click(funnel())
    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус оплаты' }), 'paid')
    expect(funnel()).toHaveClass('bg-primary')

    await user.click(screen.getByRole('button', { name: 'Сбросить' }))
    await user.click(screen.getByRole('button', { name: 'Готово' }))

    expect(funnel()).toHaveAttribute('aria-pressed', 'false')
    expect(funnel()).not.toHaveClass('bg-primary')
  })

  it('hides the price range when every order total is zero (no range to pick)', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        orders={[order({ plants: [{ name: 'Роза', quantity: 1, unitPriceMinor: 0 }] })]}
      />,
    )
    await user.click(funnel())
    expect(screen.queryByText('Сумма заказа')).not.toBeInTheDocument()
    // The status filters still render.
    expect(screen.getByRole('combobox', { name: 'Статус оплаты' })).toBeInTheDocument()
  })

  it('sets a creation-date range from the two date fields, and Reset clears it', async () => {
    const user = userEvent.setup()
    render(<Harness orders={[order()]} />)

    await user.click(funnel())
    // Always rendered (unlike the price slider, which needs a non-zero ceiling).
    const from = screen.getByLabelText('С')
    const to = screen.getByLabelText('По')
    await user.type(from, '2026-06-01')
    await user.type(to, '2026-06-30')

    // A date bound is a dialog filter → the funnel fills in.
    expect(funnel()).toHaveClass('bg-primary')
    // The `to` field's minimum tracks the chosen `from` (range can't invert).
    expect(to).toHaveAttribute('min', '2026-06-01')

    await user.click(screen.getByRole('button', { name: 'Сбросить' }))
    expect(screen.getByLabelText('С')).toHaveValue('')
    expect(screen.getByLabelText('По')).toHaveValue('')
    expect(funnel()).not.toHaveClass('bg-primary')
  })
})
