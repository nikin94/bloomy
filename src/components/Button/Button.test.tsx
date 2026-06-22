import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Button from './Button'

describe('Button', () => {
  it('renders its children as an accessible button', () => {
    render(<Button>Сохранить</Button>)
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument()
  })

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Отмена</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('honours an explicit type="submit"', () => {
    render(<Button type="submit">Сохранить</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('applies the filled style for the primary variant', () => {
    render(
      <Button variant="primary">Войти</Button>,
    )
    expect(screen.getByRole('button')).toHaveClass('bg-primary')
  })

  it('applies the outlined style for the secondary variant', () => {
    render(<Button variant="secondary">Отмена</Button>)
    expect(screen.getByRole('button')).toHaveClass('border')
  })

  it('applies the tinted danger style (border + danger text, not a solid fill)', () => {
    render(<Button variant="danger">Удалить</Button>)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('border-danger')
    expect(button).toHaveClass('text-danger')
  })

  it('forwards native attributes (onClick, disabled, aria-label)', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} aria-label="Выйти">
        ✕
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Выйти' })
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClick while disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Сохранить
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows a loader in place of its children and disables itself when isLoading', () => {
    render(
      <Button isLoading>
        Сохранить
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    // The label is swapped for the loader (status role), not rendered alongside it.
    expect(button).not.toHaveTextContent('Сохранить')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('does not fire onClick while loading', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} isLoading>
        Сохранить
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('merges a caller className alongside the variant classes', () => {
    render(<Button className="self-start">Добавить</Button>)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('self-start')
    expect(button).toHaveClass('border') // secondary default still applied
  })
})
