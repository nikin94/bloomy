import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Drive the banner from the hook directly; its polling is covered separately.
const useVersionCheck = vi.fn()
vi.mock('@/hooks/useVersionCheck', () => ({ useVersionCheck: () => useVersionCheck() }))

// Imported after the mock above is registered.
import UpdatePrompt from './UpdatePrompt'

// jsdom's window.location.reload isn't callable/spyable by default; replace the
// location object for the duration of the suite so the button can be asserted.
const reload = vi.fn()
const originalLocation = window.location

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, reload },
  })
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
})

describe('UpdatePrompt', () => {
  it('renders nothing while no update is available', () => {
    useVersionCheck.mockReturnValue(false)
    render(<UpdatePrompt />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('announces the available update with an Обновить action', () => {
    useVersionCheck.mockReturnValue(true)
    render(<UpdatePrompt />)
    expect(screen.getByRole('status')).toHaveTextContent('Доступна новая версия')
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument()
  })

  it('reloads the page when Обновить is clicked', async () => {
    const user = userEvent.setup()
    useVersionCheck.mockReturnValue(true)
    render(<UpdatePrompt />)
    await user.click(screen.getByRole('button', { name: 'Обновить' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('dismisses without reloading when Позже is clicked', async () => {
    const user = userEvent.setup()
    useVersionCheck.mockReturnValue(true)
    render(<UpdatePrompt />)
    await user.click(screen.getByRole('button', { name: 'Позже' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })
})
