import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider.tsx'
import { SettingsProvider } from './context/SettingsProvider.tsx'
import { initSentry } from './observability/sentry.ts'
import { registerServiceWorker } from './lib/registerServiceWorker.ts'
import AppCrashFallback from './components/AppCrashFallback/AppCrashFallback.tsx'
import App from './App.tsx'
// Initialise i18next before anything renders, so the first paint is already in
// the user's language (resources are bundled, so this is synchronous).
import './i18n/config.ts'
import './index.css'

// Start error monitoring before anything renders, so an exception during the
// initial mount is still captured (no-op in dev/test or without a DSN).
initSentry()

// Register the precaching service worker so the app boots offline on a cold
// start (no-op in dev/test; see registerServiceWorker).
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Top-level boundary: report a render crash to Sentry and show a recovery
        screen instead of a blank white page. Wraps the providers too, so a
        failure while auth/settings mount is caught. */}
    <Sentry.ErrorBoundary fallback={<AppCrashFallback />}>
      <AuthProvider>
        <SettingsProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </SettingsProvider>
      </AuthProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>
)
