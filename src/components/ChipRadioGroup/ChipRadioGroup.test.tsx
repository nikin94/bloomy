import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChipRadioGroup from './ChipRadioGroup'

type Method = 'cash' | 'card' | 'bank'

const OPTIONS: { value: Method; label: string }[] = [
  { value: 'cash', label: 'Наличные' },
  { value: 'card', label: 'Карта' },
  { value: 'bank', label: 'Перевод' },
]

// The component is controlled (checked derives from `value`), so the tests
// drive it through a tiny stateful harness — exactly how OrderForm hosts it.
const Harness = () => {
  const [value, setValue] = useState<Method>('cash')
  return <ChipRadioGroup label="Тип оплаты" value={value} options={OPTIONS} onChange={setValue} />
}

describe('ChipRadioGroup', () => {
  it('announces as a labelled radio group with one checked option', () => {
    render(<Harness />)
    // fieldset+legend name the group for assistive tech.
    const group = screen.getByRole('group', { name: 'Тип оплаты' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Наличные' })).toBeChecked()
  })

  it('selects an option with one click on its pill', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('radio', { name: 'Перевод' }))
    expect(screen.getByRole('radio', { name: 'Перевод' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Наличные' })).not.toBeChecked()
  })

  it('moves the selection with arrow keys (native radio-group semantics)', async () => {
    // The pills visually hide native radios sharing one generated `name` —
    // which is exactly what makes arrow-key movement work with NO key handling
    // of our own. This locks that in: a refactor away from native radios (say,
    // to styled buttons) would have to reimplement the keyboard behaviour or
    // fail here.
    const user = userEvent.setup()
    render(<Harness />)

    // Tab lands on the CHECKED radio (the group is one tab stop).
    await user.tab()
    expect(screen.getByRole('radio', { name: 'Наличные' })).toHaveFocus()

    // Arrow forward: focus AND selection move together, radio-group style.
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Карта' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Карта' })).toBeChecked()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: 'Перевод' })).toBeChecked()

    // Arrow back returns the selection the same way.
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Карта' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Наличные' })).not.toBeChecked()
  })
})
