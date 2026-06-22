import * as Sentry from '@sentry/react'

// Report a fire-and-forget failure. The offline-capable create path queues a
// write and does NOT await its promise (so the UI never blocks), which means a
// rejection has no caller to surface it. Route those to Sentry (no-op when
// Sentry isn't initialised, e.g. dev/test) and the console, so a genuinely
// failed write — e.g. an online permission-denied — is still observable.
export function reportError(error: unknown, context?: string): void {
  Sentry.captureException(error, context ? { tags: { context } } : undefined)
  console.error(context ?? 'Background error', error)
}
