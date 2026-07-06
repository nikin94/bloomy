import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@/components/Button/Button'
import { useVersionCheck } from '@/hooks/useVersionCheck'

// Non-blocking "a new version is available" toast, pinned to the bottom-right
// corner (with a margin). It is deliberately NOT a modal: a centred dialog over
// a half-filled order form would force the user to deal with it and risks a
// stray reload losing unsaved work. The toast sits out of the way, can be
// dismissed ("Later"), and only reloads on an explicit "Update" — which
// fetches a fresh index.html and so the new hashed assets. `role="status"`
// announces it politely to screen readers.
const UpdatePrompt = () => {
  const { t } = useTranslation()
  const updateAvailable = useVersionCheck()
  const [dismissed, setDismissed] = useState(false)

  if (!updateAvailable || dismissed) return null

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end p-4 sm:inset-auto sm:bottom-4 sm:right-4"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-bg p-4 shadow-xl">
        <div className="min-w-0 flex-1">
          <p className="m-0 font-medium text-heading">{t('update.title')}</p>
          <p className="m-0 text-sm text-text">{t('update.body')}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setDismissed(true)} className="shrink-0">
          {t('update.later')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => window.location.reload()}
          className="shrink-0"
        >
          {t('update.reload')}
        </Button>
      </div>
    </div>
  )
}

export default UpdatePrompt
