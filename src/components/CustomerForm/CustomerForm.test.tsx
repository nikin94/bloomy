import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomerForm from './CustomerForm'

// CustomerForm owns a customer's editable fields (name required; phone/address/
// note optional) and its own name validation; the caller decides how the result
// is persisted (onSubmit) and where cancel goes. i18next is initialised globally
// in the test setup (ru), so labels resolve to real strings the queries match.
const onSubmit = vi.fn()
const onCancel = vi.fn()

const nameField = () => screen.getByRole('textbox', { name: 'Имя клиента' })

beforeEach(() => {
  vi.clearAllMocks()
  onSubmit.mockResolvedValue(undefined)
})

describe('CustomerForm', () => {
  it('blocks submit and flags the name when it is empty', async () => {
    const user = userEvent.setup()
    render(<CustomerForm onSubmit={onSubmit} onCancel={onCancel} />)

    // The field isn't nagged before the first submit attempt.
    expect(nameField()).toHaveAttribute('aria-invalid', 'false')

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    // A blank name is required — the field is marked invalid and nothing is saved.
    expect(nameField()).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('treats a whitespace-only name as missing', async () => {
    const user = userEvent.setup()
    render(<CustomerForm onSubmit={onSubmit} onCancel={onCancel} />)

    await user.type(nameField(), '   ')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(nameField()).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the edited fields when the name is present', async () => {
    const user = userEvent.setup()
    render(<CustomerForm onSubmit={onSubmit} onCancel={onCancel} />)

    await user.type(nameField(), 'Анна')
    await user.type(screen.getByRole('textbox', { name: 'Телефон' }), '+7 900 111-22-33')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Анна',
        phone: '+7 900 111-22-33',
        address: '',
        note: '',
      }),
    )
  })

  it('prefills every field from an existing customer', () => {
    render(
      <CustomerForm
        initial={{ name: 'Борис', phone: '+7 900 222-33-44', address: 'ул. Пушкина, 1', note: 'VIP' }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    )
    expect(nameField()).toHaveValue('Борис')
    expect(screen.getByRole('textbox', { name: 'Телефон' })).toHaveValue('+7 900 222-33-44')
    expect(screen.getByRole('textbox', { name: 'Адрес' })).toHaveValue('ул. Пушкина, 1')
    expect(screen.getByRole('textbox', { name: 'Заметка о клиенте' })).toHaveValue('VIP')
  })

  it('surfaces a save failure inline and keeps the form open for a retry', async () => {
    const user = userEvent.setup()
    onSubmit.mockRejectedValue(new Error('permission-denied'))
    render(<CustomerForm onSubmit={onSubmit} onCancel={onCancel} />)

    await user.type(nameField(), 'Анна')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    // The thrown message is shown as an alert; the form is still there to retry.
    expect(await screen.findByRole('alert')).toHaveTextContent('permission-denied')
    expect(nameField()).toBeInTheDocument()
  })

  it('calls onCancel without submitting when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<CustomerForm onSubmit={onSubmit} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
