import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DetailRow from './DetailRow'

describe('DetailRow', () => {
  it('renders the label and value', () => {
    render(<DetailRow label="Телефон" value="+7 900 000-00-00" />)
    expect(screen.getByText('Телефон')).toBeInTheDocument()
    expect(screen.getByText('+7 900 000-00-00')).toBeInTheDocument()
  })

  it('renders a node value (e.g. a link)', () => {
    render(<DetailRow label="Клиент" value={<a href="/customers/c1">Анна</a>} />)
    expect(screen.getByRole('link', { name: 'Анна' })).toHaveAttribute('href', '/customers/c1')
  })

  it('applies the default label basis (from sm: up), overridable via labelBasisClass', () => {
    // The basis is prefixed `sm:` so the row can stack on a phone (no basis) and
    // become label-left / value-right only from `sm` up.
    const { rerender } = render(<DetailRow label="L" value="V" />)
    expect(screen.getByText('L')).toHaveClass('sm:basis-[200px]')

    rerender(<DetailRow label="L" value="V" labelBasisClass="sm:basis-[160px]" />)
    expect(screen.getByText('L')).toHaveClass('sm:basis-[160px]')
  })

  it('stacks on mobile and becomes a row from sm: up', () => {
    render(<DetailRow label="L" value="V" />)
    // The wrapper starts stacked (flex-col) and switches to a row at the sm
    // breakpoint, so a fixed label basis never squeezes the value on a phone.
    const wrapper = screen.getByText('L').parentElement as HTMLElement
    expect(wrapper).toHaveClass('flex-col')
    expect(wrapper).toHaveClass('sm:flex-row')
  })
})
