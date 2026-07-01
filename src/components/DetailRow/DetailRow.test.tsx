import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DetailRow from './DetailRow'

describe('DetailRow', () => {
  it('renders the label and value', () => {
    render(<DetailRow label="Телефон" value="+7 900 000-00-00" />)
    expect(screen.getByText('Телефон')).toBeInTheDocument()
    expect(screen.getByText('+7 900 000-00-00')).toBeInTheDocument()
  })

  it('renders a node value (e.g. a link) and an optional action slot', () => {
    render(
      <DetailRow
        label="Клиент"
        value={<a href="/customers/c1">Анна</a>}
        action={<button type="button">Изм.</button>}
      />,
    )
    expect(screen.getByRole('link', { name: 'Анна' })).toHaveAttribute('href', '/customers/c1')
    expect(screen.getByRole('button', { name: 'Изм.' })).toBeInTheDocument()
  })

  it('applies the default label basis, overridable via labelBasisClass', () => {
    const { rerender } = render(<DetailRow label="L" value="V" />)
    expect(screen.getByText('L')).toHaveClass('basis-[200px]')

    rerender(<DetailRow label="L" value="V" labelBasisClass="basis-[160px]" />)
    expect(screen.getByText('L')).toHaveClass('basis-[160px]')
  })
})
