import { useEffect, useState } from 'react'
import { APP_VERSION } from '../../version'

// How often to re-check while the tab stays open. The check also runs whenever
// the tab regains visibility (the likeliest moment a long-open tab missed a
// deploy), so the interval is just a backstop for a tab that's left foregrounded.
const POLL_INTERVAL_MS = 5 * 60 * 1000

// Watches the deployed /version.json for a version newer than the one this
// bundle was built at, returning true once a newer one is seen (and then never
// flipping back — a reload is the only resolution). A 'dev' build has no
// deployed file to compare against, so the check is skipped entirely there.
export const useVersionCheck = (): boolean => {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    if (APP_VERSION === 'dev' || updateAvailable) return
    let active = true

    const check = async () => {
      try {
        // Cache-bust + no-store so a long-open tab reads the freshly deployed
        // file, not a stale cached copy.
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data: { version?: string } = await res.json()
        if (active && data.version && data.version !== APP_VERSION) {
          setUpdateAvailable(true)
        }
      } catch {
        // Offline or a transient failure — ignore and try again next tick.
      }
    }

    check()
    const timer = setInterval(check, POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [updateAvailable])

  return updateAvailable
}
