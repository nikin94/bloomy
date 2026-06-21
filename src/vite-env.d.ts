/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  // Sentry DSN for error monitoring. Optional — when absent, Sentry is skipped
  // (see src/observability/sentry.ts).
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Build-time constant injected by Vite `define` (see vite.config.ts): the deploy
// git SHA, or 'dev' for a local build.
declare const __APP_VERSION__: string
