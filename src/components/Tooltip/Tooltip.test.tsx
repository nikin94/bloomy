import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Tooltip from './Tooltip'

describe('Tooltip', () => {
  it('renders the trigger children and the tooltip bubble with its label', () => {
    render(
      <Tooltip label="Подсказка">
        <span>Триггер</span>
      </Tooltip>,
    )
    expect(screen.getByText('Триггер')).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Подсказка')
  })

  it('links the focusable trigger to the bubble via aria-describedby', () => {
    render(
      <Tooltip label="Когда">
        <span>Статус</span>
      </Tooltip>,
    )
    const bubble = screen.getByRole('tooltip')
    // The wrapper is focusable (so keyboard users reach it) and points at the
    // bubble's id, so assistive tech announces the same hint shown on hover.
    const trigger = bubble.parentElement!
    expect(trigger).toHaveAttribute('tabindex', '0')
    expect(trigger).toHaveAttribute('aria-describedby', bubble.id)
  })
})
