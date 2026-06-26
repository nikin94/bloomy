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

  it('numeric="decimal" stays a text field with the decimal keypad (not a number spinner)', () => {
    render(<Input numeric="decimal" placeholder="Цена" value="" onChange={vi.fn()} />)
    const input = screen.getByPlaceholderText('Цена')
    // type="text" keeps the ru-RU comma working and drops the native spinner.
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'decimal')
  })

  it('numeric="decimal" sanitizes a keystroke before onChange (letters dropped, comma kept)', async () => {
    const onChange = vi.fn()
    render(<Input numeric="decimal" placeholder="Цена" value="12" onChange={onChange} />)
    // Typing a letter is filtered out — onChange sees the cleaned value, not "12a".
    await userEvent.type(screen.getByPlaceholderText('Цена'), 'a')
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls.at(-1)![0].target.value).toBe('12')
  })

  it('numeric="integer" uses the numeric keypad and strips non-digits', async () => {
    const onChange = vi.fn()
    render(<Input numeric="integer" placeholder="Кол-во" value="3" onChange={onChange} />)
    const input = screen.getByPlaceholderText('Кол-во')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    await userEvent.type(input, ',')
    // A decimal separator can't enter an integer field.
    expect(onChange.mock.calls.at(-1)![0].target.value).toBe('3')
  })

  it('renders a suffix node (e.g. an eye toggle) alongside the field, still typeable', async () => {
    const onChange = vi.fn()
    render(
      <Input
        placeholder="Пароль"
        value=""
        onChange={onChange}
        suffix={<button type="button">глаз</button>}
      />,
    )
    const input = screen.getByPlaceholderText('Пароль')
    // The base styling survives the wrapped (suffixed) layout.
    expect(input).toHaveClass('rounded-md')
    // The suffix is interactive (rendered above the input, not just decorative).
    expect(screen.getByRole('button', { name: 'глаз' })).toBeInTheDocument()
    // Typing still reaches onChange through the wrapper.
    await userEvent.type(input, 'a')
    expect(onChange).toHaveBeenCalled()
  })
})
