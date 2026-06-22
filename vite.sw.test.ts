import { describe, it, expect } from 'vitest'
import { buildServiceWorker, selectPrecache } from './vite.sw'

describe('selectPrecache', () => {
  it('precaches every JS and CSS chunk plus the static shell, as root URLs', () => {
    const list = selectPrecache([
      'assets/index-abc123.js',
      'assets/OrdersPage-def456.js',
      'assets/index-ghi789.css',
    ])

    // The static shell (so a cold start can boot) …
    expect(list).toEqual(
      expect.arrayContaining(['/', '/index.html', '/version.json', '/favicon.svg', '/icons.svg']),
    )
    // … and every hashed chunk, root-absolute.
    expect(list).toEqual(
      expect.arrayContaining([
        '/assets/index-abc123.js',
        '/assets/OrdersPage-def456.js',
        '/assets/index-ghi789.css',
      ]),
    )
  })

  it('ignores non-JS/CSS bundle entries (maps, the version manifest)', () => {
    const list = selectPrecache(['assets/app.js', 'assets/app.js.map', 'version.json'])
    expect(list).toContain('/assets/app.js')
    expect(list).not.toContain('/assets/app.js.map')
    // version.json is in the static shell exactly once, not duplicated from the bundle.
    expect(list.filter((u) => u === '/version.json')).toHaveLength(1)
  })

  it('is deterministic — statics first, then chunks', () => {
    const a = selectPrecache(['assets/b.js', 'assets/a.js'])
    const b = selectPrecache(['assets/b.js', 'assets/a.js'])
    expect(a).toEqual(b)
    expect(a[0]).toBe('/')
  })
})

describe('buildServiceWorker', () => {
  const source = buildServiceWorker('abc123def456', ['/', '/index.html', '/assets/app.js'])

  it('injects the build version into the cache name', () => {
    expect(source).toContain("const VERSION = \"abc123def456\"")
    expect(source).toContain("const CACHE = 'bloomy-' + VERSION")
  })

  it('injects the precache manifest', () => {
    expect(source).toContain('"/index.html"')
    expect(source).toContain('"/assets/app.js"')
  })

  it('wires the install/activate/fetch lifecycle and the kill switch', () => {
    expect(source).toContain("addEventListener('install'")
    expect(source).toContain("addEventListener('activate'")
    expect(source).toContain("addEventListener('fetch'")
    expect(source).toContain('BLOOMY_SW_KILL')
    expect(source).toContain('self.registration.unregister()')
  })

  it('serves the cached shell on a failed navigation (offline cold start)', () => {
    expect(source).toContain("req.mode === 'navigate'")
    expect(source).toContain("caches.match('/index.html')")
  })

  it('passes cross-origin and non-GET requests straight through (never caches Firestore/auth)', () => {
    expect(source).toContain("req.method !== 'GET' || url.origin !== self.location.origin")
  })

  it('keeps version.json network-first so update detection stays honest', () => {
    expect(source).toContain("url.pathname === '/version.json'")
  })
})
