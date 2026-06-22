import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { formatDateTime } from '../../utils/format'

// Mock the Firestore SDK so the component never touches the real client. The
// `db` singleton is a bare stub; waitForPendingWrites is driven per-test.
const waitForPendingWrites = vi.fn()
vi.mock('firebase/firestore', () => ({
  waitForPendingWrites: (...args: unknown[]) => waitForPendingWrites(...args),
}))
vi.mock('../../firebase/client', () => ({ db: {} }))

// Imported after the mocks above are registered.
import SyncStatus from './SyncStatus'

// jsdom's navigator.onLine is a getter; redefine it so a test can start online
// or offline. Restored in afterEach.
const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  waitForPendingWrites.mockResolvedValue(undefined)
  setOnline(true)
})

afterEach(() => {
  setOnline(true)
})

describe('SyncStatus', () => {
  it('renders nothing while online and synced', async () => {
    render(<SyncStatus />)
    // The clean online path resolves immediately and shows no indicator.
    await waitFor(() => expect(localStorage.getItem('bloomy-last-synced')).not.toBeNull())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stamps the last-synced time once queued writes are acknowledged', async () => {
    render(<SyncStatus />)
    await waitFor(() => expect(waitForPendingWrites).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(localStorage.getItem('bloomy-last-synced')).not.toBeNull())
  })

  it('shows the offline state with the last-synced time', () => {
    const synced = 1718000000000
    localStorage.setItem('bloomy-last-synced', String(synced))
    setOnline(false)

    render(<SyncStatus />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Не в сети')
    expect(status).toHaveTextContent(formatDateTime(synced))
    // Offline: it must not probe the server for pending writes.
    expect(waitForPendingWrites).not.toHaveBeenCalled()
  })

  it('omits the time when nothing was ever synced', () => {
    setOnline(false)
    render(<SyncStatus />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Не в сети')
    expect(status).not.toHaveTextContent('синхр.')
  })

  it('surfaces "Синхронизация…" only once a flush is slow', () => {
    vi.useFakeTimers()
    try {
      // A write that never acknowledges (e.g. Firebase blocked despite a link).
      waitForPendingWrites.mockReturnValue(new Promise(() => {}))
      render(<SyncStatus />)

      // Nothing shown immediately — a clean/quick flush should not flash a label.
      expect(screen.queryByRole('status')).toBeNull()

      // After the slow-flush delay the syncing label appears.
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(screen.getByRole('status')).toHaveTextContent('Синхронизация…')
    } finally {
      vi.useRealTimers()
    }
  })
})
