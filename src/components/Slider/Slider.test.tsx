import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Slider from './Slider'

describe('Slider', () => {
  it('renders an accessible range input with the given value', () => {
    render(<Slider value={3} min={0} max={10} onChange={vi.fn()} ariaLabel="Громкость" />)
    const slider = screen.getByRole('slider', { name: 'Громкость' })
    expect(slider).toHaveValue('3')
  })

  it('reports the changed value as a number', () => {
    const onChange = vi.fn()
    render(<Slider value={3} min={0} max={10} onChange={onChange} ariaLabel="Громкость" />)
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость' }), { target: { value: '7' } })
    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('exposes a human-readable value to assistive tech when provided', () => {
    render(
      <Slider value={1} min={0} max={2} onChange={vi.fn()} ariaLabel="Размер" ariaValueText="средний" />,
    )
    expect(screen.getByRole('slider', { name: 'Размер' })).toHaveAttribute('aria-valuetext', 'средний')
  })

  it('draws one notch per step when ticks is set', () => {
    const { container } = render(
      <Slider value={0} min={0} max={4} step={1} ticks={5} onChange={vi.fn()} ariaLabel="Шкала" />,
    )
    // The notches are decorative (aria-hidden); count them in the DOM.
    expect(container.querySelectorAll('[aria-hidden="true"] > span')).toHaveLength(5)
  })
})
