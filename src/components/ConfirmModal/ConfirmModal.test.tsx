import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmModal from './ConfirmModal'

// The shared confirm dialog guards every destructive flow (delete order/photo/
// customer, admin wipe), so its contract gets direct coverage: both handlers
// wired, every dismissal path counting as "cancel", and no stray third close
// affordance crowding the dialog.
const renderConfirm = () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmModal
      title="Удалить заказ?"
      body="Заказ переместится в корзину."
      confirmLabel="Удалить"
      cancelLabel="Отмена"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmModal', () => {
  it('renders a dialog named by the title, with the body and the button pair', () => {
    renderConfirm()
    const dialog = screen.getByRole('dialog', { name: 'Удалить заказ?' })
    expect(within(dialog).getByText('Заказ переместится в корзину.')).toBeInTheDocument()
    // Exactly the confirm/cancel pair — hideClose drops the header X, so the
    // dialog never offers a third, ambiguous dismissal control. (The backdrop
    // is aria-hidden and invisible to role queries.)
    expect(within(dialog).getAllByRole('button')).toHaveLength(2)
    expect(within(dialog).getByRole('button', { name: 'Удалить' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toBeInTheDocument()
  })

  it('fires onConfirm from the confirm button, without also cancelling', async () => {
    const user = userEvent.setup()
    const { onConfirm, onCancel } = renderConfirm()
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('fires onCancel from the cancel button', async () => {
    const user = userEvent.setup()
    const { onConfirm, onCancel } = renderConfirm()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('counts an Escape dismissal as cancel (the Modal onClose wiring)', async () => {
    const user = userEvent.setup()
    const { onConfirm, onCancel } = renderConfirm()
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
