import { useState } from 'react'
import Button from '../Button/Button'
import { useVersionCheck } from './useVersionCheck'

// Non-blocking "a new version is available" banner, pinned to the bottom. It is
// deliberately NOT a modal: a centred dialog over a half-filled order form would
// force the user to deal with it and risks a stray reload losing unsaved work.
// The banner sits out of the way, can be dismissed ("Позже"), and only reloads
// on an explicit "Обновить" — which fetches a fresh index.html and so the new
// hashed assets. `role="status"` announces it politely to screen readers.
const UpdatePrompt = () => {
  const updateAvailable = useVersionCheck()
  const [dismissed, setDismissed] = useState(false)

  if (!updateAvailable || dismissed) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pointer-events-none"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-bg p-4 shadow-xl">
        <div className="min-w-0 flex-1">
          <p className="m-0 font-medium text-heading">Доступна новая версия</p>
          <p className="m-0 text-sm text-text">Обновите страницу, чтобы получить последние изменения.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setDismissed(true)} className="shrink-0">
          Позже
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => window.location.reload()}
          className="shrink-0"
        >
          Обновить
        </Button>
      </div>
    </div>
  )
}

export default UpdatePrompt
