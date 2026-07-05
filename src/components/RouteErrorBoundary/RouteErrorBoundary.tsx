import type { ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Button from '@/components/Button/Button'

// Route-scoped error boundary for the content area. It sits INSIDE AppLayout,
// around the page <Outlet/>, so a page-data error shows an inline retry in the
// content column while the sidebar/header stay mounted — unlike the top-level
// Sentry.ErrorBoundary in main.tsx, whose AppCrashFallback reloads the whole app
// (kept as the last-resort crash catcher). A suspense query that errors throws to
// this boundary (useSuspenseQuery defaults to throwOnError), so the page's former
// inline `{error && <p …>}` gate now lives here as one shared treatment.
//
// The caller keys this on the route path (see AppLayout), so navigating away from
// a failed page resets the boundary — a stuck error never follows the user.
//
// Retry wiring uses TanStack's QueryErrorResetBoundary: clicking retry calls the
// fallback's `resetError`, which fires `onReset` → `reset()` to clear the errored
// queries so they refetch (a bare reset would just replay the cached rejection),
// then re-renders the children (which re-suspend on the fresh fetch). Sentry
// captures the error automatically (no-op in dev/test or without a DSN, like the
// rest of observability); `beforeCapture` tags route-data failures so they are
// distinguishable from a genuine render crash. Deliberately client-free at render
// time (no useQueryClient), so a component tree without a QueryClientProvider can
// still mount this boundary.
const RouteErrorBoundary = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation('common')
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <Sentry.ErrorBoundary
          onReset={reset}
          beforeCapture={(scope) => scope.setTag('context', 'route-data')}
          fallback={({ resetError }) => (
            <div role="alert" className="flex flex-col items-start gap-3 px-6 py-8">
              <p className="m-0 text-danger">{t('loadError')}</p>
              <Button variant="secondary" size="sm" onClick={resetError}>
                {t('retry')}
              </Button>
            </div>
          )}
        >
          {children}
        </Sentry.ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}

export default RouteErrorBoundary
