import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Reads router `location.state` ONCE (captured on mount so it survives the clear
// below and any later re-render), then strips it from history via a replace so a
// refresh or back-nav can't replay it — the "consume-once" pattern several screens
// use for one-shot navigation payloads (a just-created order's highlight id, a
// month range clicked on the stats chart, a repeat-order seed). Returns the typed
// state captured at mount, or null.
export const useConsumeNavState = <T>(): T | null => {
  const location = useLocation()
  const navigate = useNavigate()
  const [captured] = useState<T | null>((location.state as T | null) ?? null)
  useEffect(() => {
    if (location.state !== null && location.state !== undefined) {
      navigate('.', { replace: true, state: null })
    }
    // Mount-only: consume the navigation state exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return captured
}
