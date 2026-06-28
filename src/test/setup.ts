// Vitest setup, loaded once before the test suites (see vite.config.ts).
//
// Registers jest-dom matchers (toBeInTheDocument, toHaveValue, …) on Vitest's
// expect, and — because `globals: false` means React Testing Library cannot
// auto-register its own teardown — unmounts rendered trees after each test so
// component tests don't leak DOM into one another.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
// Initialise i18next once for the whole suite so components that call
// `useTranslation` render real strings (defaults to ru — no localStorage cache
// in jsdom), matching the Russian text the component tests assert on.
import '../i18n/config.ts'

afterEach(() => {
  cleanup()
})
