import i18n from '@/i18n/config'
import Button from '@/components/Button/Button'

// Shown by the top-level Sentry ErrorBoundary when a render error escapes the
// app. Sentry has already captured the exception by the time this renders, so
// this is purely the human-facing recovery UI: explain that something broke and
// offer a reload (the most reliable recovery for a corrupted render tree).
// Reads strings off the global i18n instance directly (not the useTranslation
// hook): this renders from a crashed tree, so it must not depend on React
// context/Suspense being intact.
const AppCrashFallback = () => (
  <div
    role="alert"
    className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
  >
    <h1 className="m-0 text-2xl font-semibold text-heading">{i18n.t('crash.title')}</h1>
    <p className="m-0 max-w-md text-text">{i18n.t('crash.body')}</p>
    <Button variant="primary" onClick={() => window.location.reload()}>
      {i18n.t('crash.reload')}
    </Button>
  </div>
)

export default AppCrashFallback
