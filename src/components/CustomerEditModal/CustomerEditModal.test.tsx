import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomerEditModal from './CustomerEditModal'

// The dialog three screens share (customers list, customer page, order detail).
// Covered directly: the seed → prefill mapping, the submit/cancel wiring, and
// the failed-save contract (error inline, dialog stays open for a retry).
const renderModal = (over: Partial<React.ComponentProps<typeof CustomerEditModal>> = {}) => {
  const onClose = vi.fn()
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <CustomerEditModal
      customer={{ name: 'Анна', phone: '+7 900 111-22-33', address: 'ул. Пушкина, 10', note: 'Любит пионы' }}
      title="Редактирование клиента"
      onClose={onClose}
      onSubmit={onSubmit}
      {...over}
    />,
  )
  return { onClose, onSubmit }
}

describe('CustomerEditModal', () => {
  it('renders a dialog named by the title with every field prefilled from the customer', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Редактирование клиента' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Имя клиента' })).toHaveValue('Анна')
    expect(screen.getByRole('textbox', { name: 'Телефон' })).toHaveValue('+7 900 111-22-33')
    expect(screen.getByRole('textbox', { name: 'Адрес' })).toHaveValue('ул. Пушкина, 10')
    expect(screen.getByRole('textbox', { name: 'Заметка о клиенте' })).toHaveValue('Любит пионы')
  })

  it('submits the edited fields to onSubmit', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderModal()
    const name = screen.getByRole('textbox', { name: 'Имя клиента' })
    await user.clear(name)
    await user.type(name, 'Анна Смирнова')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Анна Смирнова', phone: '+7 900 111-22-33' }),
    )
  })

  it('keeps the dialog open and shows the error inline when the save fails', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal({
      onSubmit: vi.fn().mockRejectedValue(new Error('Не удалось сохранить')),
    })
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    // The rejection surfaces inside the form; the caller is never told to close,
    // so the user can fix/retry in place.
    expect(await screen.findByText('Не удалось сохранить')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Редактирование клиента' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('wires the form cancel to onClose', async () => {
    const user = userEvent.setup()
    const { onClose, onSubmit } = renderModal()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
