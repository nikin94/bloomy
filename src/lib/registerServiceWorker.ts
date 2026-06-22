// Register the precaching service worker (see vite.sw.ts / the emit-service-worker
// build plugin). Called once at startup from main.tsx.
//
// Gated on a PRODUCTION build: dev keeps HMR (a SW would serve stale modules and
// fight the dev server), and the SW is only emitted by the build anyway, so there
// is no /sw.js to register in dev/test. Registration runs after `load` so it never
// competes with the first paint for bandwidth. A failure is swallowed — the app
// works online without the SW; it only adds offline cold-start on top.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal: offline cold-start just won't be available this session.
    })
  })
}
