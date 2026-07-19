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
// Privacy is SELECTIVE (see deferReplay): inputs and the marked customer-PII
// display sites are masked and all media blocked, while the static UI chrome
// stays readable so a replay is actually debuggable.
//
// Replay is the bulk of the SDK's weight (~44 kB gzip, the rrweb recorder, on top
// of the ~28 kB core). It is NOT attached here — it is loaded LAZILY on idle by
// deferReplay() (see below + main.tsx), so its bytes form a separate async chunk
// that downloads AFTER first paint instead of blocking the critical path (owner
// decision 2026-07-04, option B: keep replay, just defer its download). Core
// error capture is live immediately from this init. The sample rates stay here
// (they are client options the replay integration reads once it is added). No
// performance tracing — that stays off. Dev/test never init (gated on PROD+DSN).
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!import.meta.env.PROD || !dsn) return

  Sentry.init({
    dsn,
    // Tie each event to the deployed build (the same git SHA the update prompt
    // uses), so a crash report points at the exact version that produced it.
    release: APP_VERSION,
    environment: import.meta.env.MODE,
    // Replay is added later by deferReplay(); the core SDK ships eager, replay does not.
    integrations: [],
    // No routine session recording; only buffer-and-persist on an error.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
  })
}

// Lazily attach Session Replay once the app is interactive (called from an idle
// callback in main.tsx). The dynamic `import('@sentry/replay')` targets the replay
// PACKAGE directly — not the already-eager `@sentry/react` barrel — so its recorder
// bytes split into their own async chunk (see the replay carve-out in vite.config's
// manualChunks) and download off the critical path. In error-buffer mode replay
// keeps a rolling buffer and only persists it when an error fires; attaching a beat
// after load means that buffer starts a moment late — the accepted trade for taking
// ~44 kB off first paint. No-op when Sentry never initialised (dev/test or no DSN),
// since getClient() is then undefined. A failed import is swallowed: replay is a
// debugging aid, its absence must never surface to the user.
export async function deferReplay(): Promise<void> {
  const client = Sentry.getClient()
  if (!client) return
  try {
    const { replayIntegration } = await import('@sentry/replay')
    // Masking model (owner request 2026-07-19): SELECTIVE, not blanket.
    // `maskAllText: true` starred out every text node — buttons, i18n labels,
    // headings — which made replays useless for debugging while protecting
    // nothing extra (the static chrome contains no data). Instead:
    //   • maskAllInputs — everything the user TYPES stays masked (the SDK
    //     default, set explicitly so this contract is visible here);
    //   • displayed customer PII (names / phones / addresses / notes) is
    //     marked `data-sentry-mask` at its render sites — Sentry's built-in
    //     mask selector, no extra config: the orders/customers table cells and
    //     cards (via the column `masked` flag), the order page's client block,
    //     and the customer page's contact fields;
    //   • maskAttributes adds aria-label: the customers list bakes the name
    //     into row/card aria-labels, which text masking alone doesn't cover;
    //   • blockAllMedia keeps order photos out, as before.
    client.addIntegration(
      replayIntegration({
        maskAllText: false,
        maskAllInputs: true,
        maskAttributes: ['placeholder', 'title', 'aria-label'],
        blockAllMedia: true,
      }),
    )
  } catch {
    // Replay couldn't load (offline first visit, chunk fetch failed) — error
    // capture still works without it; retry isn't worth the complexity.
  }
}
