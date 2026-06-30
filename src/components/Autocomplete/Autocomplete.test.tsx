import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import Autocomplete from './Autocomplete'

// Controlled wrapper so typing and picking flow through real state, the way the
// order form drives it.
const Harness = ({ suggestions }: { suggestions: string[] }) => {
  const [value, setValue] = useState('')
  return <Autocomplete label="Растение" value={value} onChange={setValue} suggestions={suggestions} />
}

const SUGGESTIONS = ['Кактус', 'Фиалка', 'Фикус']

describe('Autocomplete', () => {
  it('shows no popup until the field is focused', () => {
    render(<Harness suggestions={SUGGESTIONS} />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('offers the whole pool on focus and narrows it as you type', async () => {
    const user = userEvent.setup()
    render(<Harness suggestions={SUGGESTIONS} />)
    const input = screen.getByRole('combobox', { name: 'Растение' })

    await user.click(input)
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(3)

    await user.type(input, 'фик')
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Фикус'])
  })

  it('fills the field when a suggestion is clicked, then closes', async () => {
    const user = userEvent.setup()
    render(<Harness suggestions={SUGGESTIONS} />)
    const input = screen.getByRole('combobox', { name: 'Растение' })

    await user.click(input)
    // mousedown is the pick trigger (so the input keeps focus); fire it directly.
    fireEvent.mouseDown(within(screen.getByRole('listbox')).getByText('Фиалка'))

    expect(input).toHaveValue('Фиалка')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('selects the active suggestion with the keyboard (ArrowDown + Enter)', async () => {
    const user = userEvent.setup()
    render(<Harness suggestions={SUGGESTIONS} />)
    const input = screen.getByRole('combobox', { name: 'Растение' })

    await user.click(input)
    await user.keyboard('{ArrowDown}{Enter}')

    expect(input).toHaveValue('Кактус')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('keeps free text the list does not know — suggestions only hint', async () => {
    const user = userEvent.setup()
    render(<Harness suggestions={SUGGESTIONS} />)
    const input = screen.getByRole('combobox', { name: 'Растение' })

    await user.type(input, 'Новый сорт')

    expect(input).toHaveValue('Новый сорт')
    // Nothing matches, so no popup blocks the free text.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
