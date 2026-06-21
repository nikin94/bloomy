import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { configDefaults } from 'vitest/config'

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
  build: SENTRY_AUTH_TOKEN ? { sourcemap: true } : {},
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
