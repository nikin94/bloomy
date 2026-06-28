import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchControl from './SearchControl'

describe('SearchControl', () => {
  it('starts collapsed as a loupe button, with the field marked inert', () => {
    render(<SearchControl value="" onChange={vi.fn()} label="Поиск клиентов" />)
    expect(screen.getByRole('button', { name: 'Поиск' })).toBeInTheDocument()
    // Collapsed → the field carries `inert`, so it's removed from the tab order
    // and focus can't land on it (jsdom doesn't drop inert nodes from the tree,
    // so we assert the attribute rather than its absence).
    expect(screen.getByRole('textbox', { name: 'Поиск клиентов' })).toHaveAttribute('inert')
  })

  it('expands to a labelled input on click and relays typing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchControl value="" onChange={onChange} label="Поиск клиентов" />)

    await user.click(screen.getByRole('button', { name: 'Поиск' }))
    const input = screen.getByRole('textbox', { name: 'Поиск клиентов' })
    await user.type(input, 'а')
    expect(onChange).toHaveBeenCalledWith('а')
  })

  it('uses the caller-supplied label as the input accessible name', async () => {
    const user = userEvent.setup()
    render(<SearchControl value="" onChange={vi.fn()} label="Поиск в корзине" />)
    await user.click(screen.getByRole('button', { name: 'Поиск' }))
    expect(screen.getByRole('textbox', { name: 'Поиск в корзине' })).toBeInTheDocument()
  })

  it('clears the query and collapses back to the loupe via the close button', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // Starts expanded because there is already a value.
    render(<SearchControl value="роза" onChange={onChange} label="Поиск заказов" />)

    expect(screen.getByRole('textbox', { name: 'Поиск заказов' })).toHaveValue('роза')
    await user.click(screen.getByRole('button', { name: 'Очистить и закрыть поиск' }))

    // Clears the query…
    expect(onChange).toHaveBeenCalledWith('')
    // …and after the collapse animation the loupe is back.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Поиск' })).toBeInTheDocument())
  })

  it('collapses on Escape while focused in the field', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchControl value="роза" onChange={onChange} label="Поиск заказов" />)

    screen.getByRole('textbox', { name: 'Поиск заказов' }).focus()
    await user.keyboard('{Escape}')

    expect(onChange).toHaveBeenCalledWith('')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Поиск' })).toBeInTheDocument())
  })
})
