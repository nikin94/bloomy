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
import i18n from '@/i18n/config.ts'
import { DEFAULT_LANGUAGE } from '@/types/settings'

// jsdom has no matchMedia; useMediaQuery needs it (the sidebar gates its
// per-page actions on the md breakpoint). Stub it to report DESKTOP — the page
// tests scope their search/filter queries to the desktop rail — with the full
// MediaQueryList surface so subscribe/getSnapshot work.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

afterEach(() => {
  cleanup()
  // i18next state is global; a test that switches language (via the provider or
  // config) would otherwise leak `en` into the next suite and break assertions
  // on Russian strings. Reset to the default after every test.
  void i18n.changeLanguage(DEFAULT_LANGUAGE)
})
