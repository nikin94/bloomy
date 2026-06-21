import * as Sentry from '@sentry/react'
import { APP_VERSION } from '../version'

// Initialise Sentry error monitoring. Called once at startup (see main.tsx).
//
// Gated on a PRODUCTION build AND a configured DSN: dev/test runs never send (so
// local errors don't pollute the dashboard or burn the free quota), and a build
// without VITE_SENTRY_DSN simply skips Sentry instead of throwing. The DSN is a
// public, embeddable value by design, but it's read from the environment so the
// project (and dev vs prod) stays configurable — see .env.example.
//
// Deliberately ERRORS-ONLY: no Session Replay and no performance tracing. Those
// integrations are the bulk of the SDK's weight (~60 kB gzip on top of the ~28 kB
// core) and would land in the INITIAL bundle, because both must initialise before
// an error to be useful (replay can't be lazy-loaded and still capture the lead-up
// to a crash). The main user is on a slow, filtered connection, so that upfront
// cost isn't justified for a nice-to-have. Exception capture + the ErrorBoundary
// already solve the actual need ("we can't see production errors").
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!import.meta.env.PROD || !dsn) return

  Sentry.init({
    dsn,
    // Tie each event to the deployed build (the same git SHA the update prompt
    // uses), so a crash report points at the exact version that produced it.
    release: APP_VERSION,
    environment: import.meta.env.MODE,
  })
}
