import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { configDefaults } from 'vitest/config'
import { buildServiceWorker, selectPrecache } from './vite.sw'

// Build version: CI stamps the deploy's git SHA (GITHUB_SHA); a local build/dev
// run gets 'dev'. It is both baked into the bundle (`__APP_VERSION__`, so the
// running app knows its own version) and written to dist/version.json, which the
// app polls to detect that a newer version was deployed. The two always agree
// because they come from this single value.
const APP_VERSION = (process.env.GITHUB_SHA ?? 'dev').slice(0, 12)

// Sentry source-map upload is OPT-IN, gated on an auth token in the environment.
// Without it a normal `yarn build` still works (Sentry just reports minified
// stack traces); set SENTRY_AUTH_TOKEN/ORG/PROJECT to upload source maps so the
// dashboard shows readable code. Build-time only, so these are plain env vars
// (not VITE_-prefixed — they must never reach the client bundle).
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  // Generate source maps only when we're going to upload (and then delete) them,
  // so they're never shipped publicly alongside the bundle.
  build: {
    // Generate source maps only when we're going to upload (and then delete)
    // them, so they're never shipped publicly alongside the bundle.
    ...(SENTRY_AUTH_TOKEN ? { sourcemap: true } : {}),
    rollupOptions: {
      output: {
        // Split the two heaviest startup dependencies into their own chunks so the
        // app-code entry isn't one ~780 kB monolith. Both load eagerly anyway
        // (Firebase via AuthProvider at boot, Sentry via initSentry — now carrying
        // Session Replay), but as separate files they cache independently of app
        // code and download in parallel, and the entry drops well under the 500 kB
        // warning. Only these two are peeled — the lazy PAGE chunks keep Vite's
        // default per-route splitting, so nothing lazy-only is pulled in eagerly.
        manualChunks: (id: string) => {
          if (id.includes('@firebase') || /node_modules\/firebase\//.test(id)) return 'firebase'
          if (id.includes('@sentry')) return 'sentry'
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] }),
    // Emit /version.json next to the bundle so the deployed app can fetch it and
    // compare against its baked-in version. Build only — dev/test don't need it.
    {
      name: 'emit-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: APP_VERSION }),
        })
      },
    },
    // Emit /sw.js — a tiny hand-rolled service worker that precaches the app
    // shell so the app boots and runs fully offline (cold start), not just while
    // a tab stays open. Build only (dev keeps HMR; no SW). The precache manifest
    // is the build's hashed chunks (read from the bundle here) plus the static
    // shell; the SW source is keyed to this build's version so a new deploy
    // refreshes the cache. Hand-rolled rather than vite-plugin-pwa to stay
    // compatible with the rolldown-based build and to own the version.json
    // interaction + kill switch (see vite.sw.ts).
    {
      name: 'emit-service-worker',
      apply: 'build',
      generateBundle(_options, bundle) {
        const precache = selectPrecache(Object.keys(bundle))
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: buildServiceWorker(APP_VERSION, precache),
        })
      },
    },
    // Upload source maps to Sentry on a production build, tagged with the same
    // release as the running app. Added only when a token is configured; the
    // maps are deleted from the output after upload so they don't ship publicly.
    ...(SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: SENTRY_AUTH_TOKEN,
            release: { name: APP_VERSION },
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
          }),
        ]
      : []),
  ],
  // Vitest config. `globals: false` keeps the test API explicit (imported from
  // 'vitest'), matching the codebase's explicit-imports style; the setup file
  // wires jest-dom matchers and React Testing Library cleanup in their place.
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    // Emulator-backed tests need a running Firestore emulator, so they are run
    // separately (`yarn test:emulator`, `yarn test:rules`), not in the default run.
    exclude: [...configDefaults.exclude, '**/*.emulator.test.ts', '**/*.rules.test.ts'],
  },
})
