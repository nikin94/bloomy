import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Textarea from './Textarea'

describe('Textarea', () => {
  it('forwards native props and is vertically resizable', () => {
    render(<Textarea placeholder="Заметка" value="hi" onChange={vi.fn()} />)
    const area = screen.getByPlaceholderText('Заметка')
    expect(area.tagName).toBe('TEXTAREA')
    expect(area).toHaveValue('hi')
    expect(area).toHaveClass('resize-y')
  })

  it('merges a per-usage className on top of the base styles', () => {
    render(<Textarea placeholder="Комментарий" className="min-h-20" value="" onChange={vi.fn()} />)
    const area = screen.getByPlaceholderText('Комментарий')
    expect(area).toHaveClass('min-h-20')
    expect(area).toHaveClass('rounded-md') // base styling still present
  })

  it('relays typing through onChange', async () => {
    const onChange = vi.fn()
    render(<Textarea placeholder="Заметка" value="" onChange={onChange} />)
    await userEvent.type(screen.getByPlaceholderText('Заметка'), 'x')
    expect(onChange).toHaveBeenCalled()
  })
})
