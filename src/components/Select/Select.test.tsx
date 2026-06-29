import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Select from './Select'

const options = (
  <>
    <option value="a">A</option>
    <option value="b">B</option>
  </>
)

describe('Select', () => {
  it('renders without a label (the caller labels it elsewhere) and forwards props', () => {
    render(
      <Select aria-label="Кол-во" value="a" onChange={vi.fn()}>
        {options}
      </Select>,
    )
    const select = screen.getByRole('combobox', { name: 'Кол-во' })
    expect(select.tagName).toBe('SELECT')
    expect(select).toHaveValue('a')
    // No floating <label> is rendered in the no-label path.
    expect(document.querySelector('label')).toBeNull()
  })

  it('renders a floating label linked to the select, which becomes its accessible name', () => {
    render(
      <Select label="Способ доставки" value="a" onChange={vi.fn()}>
        {options}
      </Select>,
    )
    // The <label htmlFor> doubles as the accessible name (no aria-label needed).
    const select = screen.getByRole('combobox', { name: 'Способ доставки' })
    expect(select).toHaveClass('peer') // peer drives the floating label's focus/invalid styling
  })

  it('reflects the invalid state via aria-invalid and the danger border', () => {
    render(
      <Select label="Способ доставки" invalid value="a" onChange={vi.fn()}>
        {options}
      </Select>,
    )
    const select = screen.getByRole('combobox', { name: 'Способ доставки' })
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveClass('border-danger')
  })
})
