import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The seeder is loaded with a DYNAMIC import on the button press; vi.mock
// intercepts dynamic imports by resolved path the same as static ones, so this
// stub is what the click loads.
const seedMockData = vi.fn()
vi.mock('../../firebase/seed', () => ({
  seedMockData: (...a: unknown[]) => seedMockData(...a),
}))

import AdminSeedSection from './AdminSeedSection'

beforeEach(() => {
  vi.clearAllMocks()
  seedMockData.mockResolvedValue({ reset: false, customers: 12, orders: 100, trashed: 9 })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdminSeedSection', () => {
  it('seeds without reset by default and reports the result', async () => {
    const user = userEvent.setup()
    render(<AdminSeedSection ownerId="owner-1" />)

    await user.click(screen.getByRole('button', { name: 'Засеять тестовые данные' }))

    expect(seedMockData).toHaveBeenCalledWith('owner-1', { reset: false })
    // The one-sentence result (role=status so it is announced).
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Готово: +12 клиентов, +100 заказов (в корзине 9)',
    )
  })

  it('gates the destructive reset behind window.confirm and aborts on decline', async () => {
    const user = userEvent.setup()
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    render(<AdminSeedSection ownerId="owner-1" />)

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Засеять тестовые данные' }))

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(seedMockData).not.toHaveBeenCalled()
  })

  it('seeds with reset once the confirm is accepted', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    seedMockData.mockResolvedValue({
      reset: true,
      customers: 12,
      orders: 100,
      trashed: 9,
      removedOrders: 3,
      removedCustomers: 2,
    })
    render(<AdminSeedSection ownerId="owner-1" />)

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Засеять тестовые данные' }))

    expect(seedMockData).toHaveBeenCalledWith('owner-1', { reset: true })
    expect(await screen.findByRole('status')).toHaveTextContent('удалено 3 заказов, 2 клиентов')
  })

  it('surfaces a failed seed as an alert', async () => {
    const user = userEvent.setup()
    seedMockData.mockRejectedValue(new Error('permission-denied'))
    render(<AdminSeedSection ownerId="owner-1" />)

    await user.click(screen.getByRole('button', { name: 'Засеять тестовые данные' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('permission-denied')
  })
})
