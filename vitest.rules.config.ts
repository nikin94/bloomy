import { defineConfig } from 'vitest/config'

// Separate config for Firestore security-rules tests. These run against the
// Firestore emulator (started by `yarn test:rules` via `firebase emulators:exec`)
// using @firebase/rules-unit-testing, which loads firestore.rules itself, so they
// are kept out of the default `yarn test` run. Node environment — no DOM needed.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['**/*.rules.test.ts'],
    // First emulator call is cold; give more headroom than the 5s default.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
