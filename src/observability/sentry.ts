import * as Sentry from '@sentry/react'
import { APP_VERSION } from '@/version'

// Initialise Sentry error monitoring. Called once at startup (see main.tsx).
//
// Gated on a PRODUCTION build AND a configured DSN: dev/test runs never send (so
// local errors don't pollute the dashboard or burn the free quota), and a build
// without VITE_SENTRY_DSN simply skips Sentry instead of throwing. The DSN is a
// public, embeddable value by design, but it's read from the environment so the
// project (and dev vs prod) stays configurable — see .env.example.
//
// Session Replay is enabled in PRODUCTION ONLY (owner request 2026-07-02), and
// deliberately in ERROR-BUFFER mode: `replaysSessionSampleRate: 0` records no
// ordinary sessions, while `replaysOnErrorSampleRate: 1` keeps a rolling buffer
// and only PERSISTS a replay when an error fires — so a crash report carries the
// clip leading up to it, with no recording (or quota cost) for healthy sessions.
// Privacy defaults are conservative: all text is masked and all media blocked, so
// order/customer data never leaves the device inside a replay.
//
// COST NOTE: replay is the bulk of the SDK's weight (~50 kB gzip on top of the
// ~28 kB core) and lands in the INITIAL bundle, because the buffer must be
// running before an error to capture the lead-up (it can't be lazily loaded and
// still record the moments before a crash). This reverses the earlier
// errors-only stance; the owner accepted the upfront cost for prod debuggability.
// Dev/test never load it (the whole init is gated on PROD + a DSN), so local
// builds stay lean. No performance tracing — that stays off.
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!import.meta.env.PROD || !dsn) return

  Sentry.init({
    dsn,
    // Tie each event to the deployed build (the same git SHA the update prompt
    // uses), so a crash report points at the exact version that produced it.
    release: APP_VERSION,
    environment: import.meta.env.MODE,
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
    // No routine session recording; only buffer-and-persist on an error.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
  })
}
