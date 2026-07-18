import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryWrapper } from '@/test/queryWrapper'

// The wipe code is loaded with a DYNAMIC import on confirm; vi.mock intercepts
// dynamic imports by resolved path the same as static ones.
const wipeOwnerData = vi.fn()
vi.mock('../../firebase/seed', () => ({
  wipeOwnerData: (...a: unknown[]) => wipeOwnerData(...a),
}))

import AdminWipeSection from './AdminWipeSection'

// QueryWrapper: the section invalidates the order/customer caches after a wipe,
// so its cache hooks need a QueryClient around them.
const renderSection = () =>
  render(
    <QueryWrapper>
      <AdminWipeSection ownerId="owner-1" />
    </QueryWrapper>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  wipeOwnerData.mockResolvedValue({ removedOrders: 100, removedCustomers: 12 })
})

describe('AdminWipeSection', () => {
  it('wipes only after the dialog confirm, and reports the result', async () => {
    const user = userEvent.setup()
    renderSection()

    // The destructive action is two-step: the button only opens the dialog.
    await user.click(screen.getByRole('button', { name: 'Удалить все заказы и клиентов' }))
    expect(wipeOwnerData).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog', { name: 'Удалить все данные аккаунта?' })
    expect(dialog).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Удалить' }))

    expect(wipeOwnerData).toHaveBeenCalledWith('owner-1')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Готово: удалено 100 заказов и 12 клиентов.',
    )
  })

  it('does nothing when the dialog is cancelled', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: 'Удалить все заказы и клиентов' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(wipeOwnerData).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('surfaces a failed wipe as an alert', async () => {
    const user = userEvent.setup()
    wipeOwnerData.mockRejectedValue(new Error('permission-denied'))
    renderSection()

    await user.click(screen.getByRole('button', { name: 'Удалить все заказы и клиентов' }))
    await user.click(screen.getByRole('button', { name: 'Удалить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('permission-denied')
  })
})
