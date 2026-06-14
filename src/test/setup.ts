// Vitest setup, loaded once before the test suites (see vite.config.ts).
//
// Registers jest-dom matchers (toBeInTheDocument, toHaveValue, …) on Vitest's
// expect, and — because `globals: false` means React Testing Library cannot
// auto-register its own teardown — unmounts rendered trees after each test so
// component tests don't leak DOM into one another.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
