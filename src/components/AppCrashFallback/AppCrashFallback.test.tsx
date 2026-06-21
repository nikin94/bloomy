import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppCrashFallback from './AppCrashFallback'

describe('AppCrashFallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('announces the crash as an alert with a recovery message', () => {
    render(<AppCrashFallback />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Что-то пошло не так')
    // Reassures the user the error was reported (Sentry captured it).
    expect(alert).toHaveTextContent(/получили отчёт/i)
  })

  it('reloads the page when the recovery button is clicked', async () => {
    // jsdom's window.location.reload is non-configurable, so stub the whole
    // location object to observe the reload call.
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(<AppCrashFallback />)

    await userEvent.click(screen.getByRole('button', { name: 'Перезагрузить' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
