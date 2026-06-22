import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Loader from './Loader'

describe('Loader', () => {
  it('exposes a status role with a Russian label so a busy control announces it', () => {
    render(<Loader />)
    expect(screen.getByRole('status', { name: 'Загрузка' })).toBeInTheDocument()
  })

  it('applies the requested size and draws the arc from currentColor', () => {
    render(<Loader size="sm" />)
    const loader = screen.getByRole('status', { name: 'Загрузка' })
    // sm size + the currentColor arc (transparent track, coloured top edge) so it
    // contrasts against whatever button/background it sits on.
    expect(loader).toHaveClass('size-4', 'border-t-current', 'border-transparent', 'animate-spin')
  })

  it('merges a per-usage className (e.g. the page spinner tinting it brand)', () => {
    render(<Loader size="lg" className="text-primary" />)
    const loader = screen.getByRole('status', { name: 'Загрузка' })
    expect(loader).toHaveClass('size-16', 'text-primary')
  })
})
