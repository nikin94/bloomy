import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { formatDateTime } from '@/utils/format'

// Mock the sync data-layer helper so the component never touches the real SDK.
// awaitPendingWrites (the wrapper over awaitPendingWrites + db) is driven per-test.
const awaitPendingWrites = vi.fn()
vi.mock('../../firebase/sync', () => ({
  awaitPendingWrites: (...args: unknown[]) => awaitPendingWrites(...args),
}))

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
  awaitPendingWrites.mockResolvedValue(undefined)
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
    await waitFor(() => expect(awaitPendingWrites).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(localStorage.getItem('bloomy-last-synced')).not.toBeNull())
  })

  it('shows the offline state with the last-synced time in the tooltip', () => {
    const synced = 1718000000000
    localStorage.setItem('bloomy-last-synced', String(synced))
    setOnline(false)

    render(<SyncStatus />)

    const status = screen.getByRole('status')
    // Inline text stays compact — just "Не в сети".
    expect(status).toHaveTextContent('Не в сети')
    // The last-synced time lives in the instant hover tooltip (role="tooltip"),
    // not inline — and the badge is described by it for screen readers.
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      `Последняя синхронизация: ${formatDateTime(synced)}`,
    )
    // Offline: it must not probe the server for pending writes.
    expect(awaitPendingWrites).not.toHaveBeenCalled()
  })

  it('omits the tooltip when nothing was ever synced', () => {
    setOnline(false)
    render(<SyncStatus />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Не в сети')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('surfaces "Синхронизация…" only once a flush is slow', () => {
    vi.useFakeTimers()
    try {
      // A write that never acknowledges (e.g. Firebase blocked despite a link).
      awaitPendingWrites.mockReturnValue(new Promise(() => {}))
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
