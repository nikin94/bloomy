import Button from '../Button/Button'

// Shown by the top-level Sentry ErrorBoundary when a render error escapes the
// app. Sentry has already captured the exception by the time this renders, so
// this is purely the human-facing recovery UI: explain that something broke and
// offer a reload (the most reliable recovery for a corrupted render tree).
const AppCrashFallback = () => (
  <div
    role="alert"
    className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
  >
    <h1 className="m-0 text-2xl font-semibold text-heading">Что-то пошло не так</h1>
    <p className="m-0 max-w-md text-text">
      Произошла непредвиденная ошибка. Мы уже получили отчёт о ней. Попробуйте
      перезагрузить страницу.
    </p>
    <Button variant="primary" onClick={() => window.location.reload()}>
      Перезагрузить
    </Button>
  </div>
)

export default AppCrashFallback
