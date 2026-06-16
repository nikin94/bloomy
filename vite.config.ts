import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { configDefaults } from 'vitest/config'

// Build version: CI stamps the deploy's git SHA (GITHUB_SHA); a local build/dev
// run gets 'dev'. It is both baked into the bundle (`__APP_VERSION__`, so the
// running app knows its own version) and written to dist/version.json, which the
// app polls to detect that a newer version was deployed. The two always agree
// because they come from this single value.
const APP_VERSION = (process.env.GITHUB_SHA ?? 'dev').slice(0, 12)

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
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
