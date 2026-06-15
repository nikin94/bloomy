import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Input from './Input'

describe('Input', () => {
  it('forwards native props (placeholder, value, type) to the input', () => {
    render(<Input type="number" placeholder="Кол-во" value="3" onChange={vi.fn()} />)
    const input = screen.getByPlaceholderText('Кол-во')
    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveValue(3)
  })

  it('reports a valid field by default (aria-invalid false, normal border)', () => {
    render(<Input placeholder="Имя" onChange={vi.fn()} value="" />)
    const input = screen.getByPlaceholderText('Имя')
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(input).toHaveClass('border-border')
    expect(input).not.toHaveClass('border-danger')
  })

  it('reflects the invalid state with aria-invalid and the danger border', () => {
    render(<Input placeholder="Цена" invalid onChange={vi.fn()} value="" />)
    const input = screen.getByPlaceholderText('Цена')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveClass('border-danger')
    expect(input).not.toHaveClass('border-border')
  })

  it('merges a per-usage className on top of the base styles', () => {
    render(<Input placeholder="Адрес" className="flex-1" onChange={vi.fn()} value="" />)
    const input = screen.getByPlaceholderText('Адрес')
    expect(input).toHaveClass('flex-1')
    expect(input).toHaveClass('rounded-md') // base styling still present
  })

  it('relays typing through onChange', async () => {
    const onChange = vi.fn()
    render(<Input placeholder="Имя" value="" onChange={onChange} />)
    await userEvent.type(screen.getByPlaceholderText('Имя'), 'a')
    expect(onChange).toHaveBeenCalled()
  })
})
