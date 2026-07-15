import { useEffect, useRef, useState } from 'react'
import { getPhotoUrl } from '@/firebase/photos'
import { reportError } from '@/observability/reportError'

// Resolved download URLs for a list of Storage photo paths, keyed by path.
// Extracted from the detail gallery (OrderPhotos) so the edit form's picker —
// which now shows the order's saved photos too — resolves thumbnails the same way.
//
// `requestedRef` tracks the paths a URL request was already kicked off for,
// guarding the resolve effect so a resolved URL (a state change) doesn't
// re-trigger it for every thumbnail. It must NOT be paired with a per-run
// `active` flag: under StrictMode's mount→cleanup→mount the ref survives the
// re-run, so the second run skips the already-requested path while the first
// run's resolved URL would be discarded — leaving the thumbnail stuck on its
// loader forever (the bug once seen on re-entering an order with photos).
// Instead a mount-lifetime flag gates late resolves: setUrls is keyed by path
// (idempotent), so applying one is always safe until a REAL unmount.
export const usePhotoUrls = (paths: string[]): Record<string, string> => {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const requestedRef = useRef<Set<string>>(new Set())

  // True for the component's whole lifetime; flipped only on a real unmount.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    for (const path of paths) {
      if (requestedRef.current.has(path)) continue
      requestedRef.current.add(path)
      getPhotoUrl(path)
        .then((url) => {
          if (mountedRef.current) setUrls((prev) => ({ ...prev, [path]: url }))
        })
        .catch((err: unknown) => {
          // Allow a retry on the next render once the connection is back.
          requestedRef.current.delete(path)
          reportError(err, 'getPhotoUrl')
        })
    }
  }, [paths])

  return urls
}
