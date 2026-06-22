import { useEffect, useState } from 'react'
import { waitForPendingWrites } from 'firebase/firestore'
import { db } from '../../firebase/client'
import { formatDateTime } from '../../utils/format'

// localStorage key for the last moment Firestore confirmed our queued writes
// reached the server. Persisted so the indicator can show a real "last synced"
// time straight after a reload, before any new sync happens this session.
const LAST_SYNCED_KEY = 'bloomy-last-synced'

const readLastSynced = (): number | null => {
  try {
    const raw = localStorage.getItem(LAST_SYNCED_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

const writeLastSynced = (ms: number) => {
  try {
    localStorage.setItem(LAST_SYNCED_KEY, String(ms))
  } catch {
    // Private mode / storage disabled — the time just won't survive a reload.
  }
}

// Connection / sync indicator for the offline-capable data layer. Renders ONLY
// when there is something worth saying — the browser is offline, or queued
// writes are still flushing — so the header stays clean while everything is in
// sync. Offline shows just "Не в сети" to stay compact; WHEN the local data last
// reached the server is in the `title` tooltip (hover) instead of inline, so the
// header doesn't widen. The freshness is taken from waitForPendingWrites (a real
// server acknowledgement), not navigator.onLine alone, so it stays honest in the
// case that matters most here: the network is up but Firebase itself is blocked —
// then writes never flush and the indicator keeps showing "Синхронизация…"
// instead of falsely claiming a sync.
const SyncStatus = () => {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(readLastSynced)
  // True while online but a flush is taking long enough to be worth surfacing
  // (just reconnected with a backlog, or Firebase reachable again after a block).
  const [flushing, setFlushing] = useState(false)

  // Track the browser's online/offline transitions.
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // While online, wait for any queued writes to be acknowledged by the server,
  // then stamp the sync time. waitForPendingWrites resolves immediately when
  // nothing is queued (a clean load just stamps "now"); it stays pending while
  // writes are still flushing. We only flip `flushing` true after a short delay,
  // so a clean load doesn't flash "Синхронизация…" — the label appears only for
  // a genuinely slow flush (e.g. a backlog, or Firebase blocked despite a link).
  useEffect(() => {
    if (!online) return
    let active = true
    const slowFlush = setTimeout(() => {
      if (active) setFlushing(true)
    }, 500)
    waitForPendingWrites(db)
      .then(() => {
        if (!active) return
        const now = Date.now()
        setLastSyncedAt(now)
        writeLastSynced(now)
      })
      .catch(() => {
        // Best-effort: a failure here just leaves the previous stamp in place.
      })
      .finally(() => {
        clearTimeout(slowFlush)
        if (active) setFlushing(false)
      })
    return () => {
      active = false
      clearTimeout(slowFlush)
    }
  }, [online])

  // Nothing to report: online and everything already acknowledged.
  if (online && !flushing) return null

  // Last-synced time lives in the tooltip (hover), not inline, so offline shows
  // just "Не в сети" and the header stays compact.
  const lastSyncedTitle =
    !online && lastSyncedAt !== null
      ? `Последняя синхронизация: ${formatDateTime(lastSyncedAt)}`
      : undefined

  return (
    <div
      role="status"
      aria-live="polite"
      title={lastSyncedTitle}
      className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-text"
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${online ? 'animate-pulse bg-primary' : 'bg-text'}`}
      />
      <span className="whitespace-nowrap">{online ? 'Синхронизация…' : 'Не в сети'}</span>
    </div>
  )
}

export default SyncStatus
