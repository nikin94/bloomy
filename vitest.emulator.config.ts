import { defineConfig } from 'vitest/config'

// Separate config for emulator-backed data-layer tests. These need the Firestore
// emulator running (started by `yarn test:emulator` via `firebase emulators:exec`)
// and a real project id, so they are kept out of the default `yarn test` run
// (which excludes `*.emulator.test.ts`). Node environment — no DOM needed.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['**/*.emulator.test.ts'],
    setupFiles: ['./src/test/emulator-setup.ts'],
    // The app's firebase.ts reads the project id from this; a `demo-*` id needs
    // no credentials and matches the project the emulator runs under.
    env: { VITE_FIREBASE_PROJECT_ID: 'demo-bloomy' },
    // Transactions retry under contention and the first emulator call is cold;
    // the seed test also writes/reads ~100 orders in one go. Allow generous
    // headroom over the 5s default so a cold CI emulator doesn't flake.
    testTimeout: 40000,
    hookTimeout: 40000,
  },
})
