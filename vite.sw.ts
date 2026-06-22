// Service-worker source builder, used by the inline `emit-service-worker` plugin
// in vite.config.ts. Kept here (not inline in the config) so the precache
// selection and the SW body are pure, readable functions we can unit-test
// (vite.sw.test.ts) — the SW itself runs in a worker context that jsdom can't
// exercise, so the testable surface is "which files get precached" and "is the
// emitted source well-formed", which these two functions own.

// Files served from public/ (verbatim, no content hash) that the app shell needs
// to boot offline. The hashed JS/CSS chunks are added from the build manifest
// (see selectPrecache); these are the unhashed extras.
//
// `/` and `/index.html` are both listed because a navigation can resolve to
// either, and the SW serves the cached index.html as the offline app shell.
const STATIC_PRECACHE = ['/', '/index.html', '/version.json', '/favicon.svg', '/icons.svg']

// Build the precache list from the rolled-up bundle's file names. Every emitted
// JS and CSS chunk is precached (so the WHOLE app — including lazy route chunks —
// is available offline immediately after the SW installs, not just what was
// visited), plus the unhashed static shell above. Non-JS/CSS assets (source maps,
// the manifest we emit separately) are skipped. Returns root-absolute URLs.
export function selectPrecache(bundleFileNames: string[]): string[] {
  const hashed = bundleFileNames
    .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
    .map((name) => '/' + name)
  // De-dupe in case a static path ever overlaps a bundle name, and keep a stable
  // order (statics first) so the emitted source is deterministic across builds.
  return [...STATIC_PRECACHE, ...hashed.filter((url) => !STATIC_PRECACHE.includes(url))]
}

// Build the service-worker JavaScript source as a string, with the build version
// and precache manifest injected. The SW is deliberately tiny and dependency-free
// (no Workbox): it precaches the shell on install, cleans up old version caches on
// activate, and on fetch serves navigations and same-origin assets from the cache
// so the app boots and runs fully offline — while passing EVERYTHING else
// (Firestore, Google auth, any cross-origin or non-GET request) straight to the
// network untouched, so the data layer's own offline handling is never disturbed.
//
// Update path: each deploy bakes a new version → a new cache name → the new SW
// precaches the new shell and deletes the old cache on activate. Combined with the
// existing version.json poll + UpdatePrompt, the user is told to reload, which
// activates the new SW. version.json itself is network-first so update detection
// stays honest online.
//
// Kill switch (brick-safety): the SW handles a 'BLOOMY_SW_KILL' postMessage by
// unregistering itself and clearing its caches. If a deploy ever needs to disable
// the SW wholesale, replacing sw.js with a self-unregistering build is the
// standard remote escape hatch (documented in the README).
export function buildServiceWorker(version: string, precache: string[]): string {
  return `// AUTO-GENERATED at build time by the emit-service-worker plugin. Do not edit.
const VERSION = ${JSON.stringify(version)}
const CACHE = 'bloomy-' + VERSION
const PRECACHE = ${JSON.stringify(precache)}

self.addEventListener('install', (event) => {
  // Precache the whole shell, then take over at once so the first load is covered.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop caches from older versions so storage doesn't grow unbounded and a
    // stale shell can never be served after an update.
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k.startsWith('bloomy-') && k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  // Kill switch: unregister and wipe caches on demand (brick-safety escape hatch).
  if (event.data && event.data.type === 'BLOOMY_SW_KILL') {
    event.waitUntil((async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('bloomy-')).map((k) => caches.delete(k)))
      await self.registration.unregister()
    })())
  }
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  // Only ever touch same-origin GETs. Firestore, Google auth, analytics, any
  // cross-origin or non-GET request is left entirely to the network and the data
  // layer's own offline handling — the SW must never cache or block those.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Navigations: try the network, fall back to the cached app shell so a cold
  // start with no connection still boots the SPA (the router then renders the
  // route from cached chunks).
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')))
    return
  }

  // version.json drives update detection — keep it network-first so a fresh
  // deploy is noticed online; fall back to any cached copy (ignoring the
  // cache-busting query) when offline.
  if (url.pathname === '/version.json') {
    event.respondWith(fetch(req).catch(() => caches.match('/version.json', { ignoreSearch: true })))
    return
  }

  // Hashed static assets are immutable, so cache-first is safe and fast; on a
  // miss, fetch and tuck the response into the cache for next time (this is what
  // makes a lazy chunk visited once online available offline afterwards).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(req, copy))
        }
        return res
      })
    }),
  )
})
`
}
