import { useEffect, useState } from 'react'
import { useSettings } from '../../context/settingsContext'
import { signOutUser } from '../../firebase/auth'
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP } from '../../types/settings'
import Button from '../Button/Button'

// Sample sentence so the user can watch the size change. The whole app scales
// live with the slider (see SettingsProvider), so this paragraph — being on the
// page — reflects the chosen size too.
const SAMPLE_TEXT = 'Пример текста — так будет выглядеть интерфейс приложения.'

const LogoutIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-5"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

const CloseIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-5"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

// Mounts the dialog only while open, so each opening starts from the persisted
// size (draft is seeded from `fontScale` on mount) without a reset effect.
const SettingsModal = ({ open, onClose }: { open: boolean; onClose: () => void }) =>
  open ? <SettingsDialog onClose={onClose} /> : null

// Settings dialog. For now it holds the per-user font size (an iOS-style size
// slider with a live sample) and the sign-out action. The slider updates the
// whole app immediately for preview, but the size is only persisted to Firebase
// on "Сохранить"; closing without saving reverts the preview to the saved size.
const SettingsDialog = ({ onClose }: { onClose: () => void }) => {
  const { fontScale, previewFontScale, saveFontScale } = useSettings()
  const [draft, setDraft] = useState(fontScale)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Esc closes and reverts the live preview to the saved size.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        previewFontScale(fontScale)
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fontScale, previewFontScale, onClose])

  // Close without saving: drop the preview back to the persisted size.
  const handleClose = () => {
    previewFontScale(fontScale)
    onClose()
  }

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value)
    setDraft(next)
    previewFontScale(next) // live page update; not persisted until "Сохранить"
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveFontScale(draft)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить настройки')
      setSaving(false)
    }
  }

  const handleLogout = () => {
    onClose()
    // signOut is a local operation (clears the persisted session, no network
    // request), so failure is unlikely — but don't swallow it silently.
    signOutUser().catch((err: unknown) => console.error('Sign-out failed', err))
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop: tap outside to close (reverting the preview). */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={handleClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />

      <div className="relative z-10 flex w-full max-w-md flex-col gap-6 rounded-lg border border-border bg-bg p-6 shadow-xl">
        <header className="flex items-center justify-between gap-3">
          <h2 id="settings-title" className="m-0 text-lg font-semibold text-heading">
            Настройки
          </h2>
          <Button
            variant="secondary"
            size="icon"
            onClick={handleClose}
            aria-label="Закрыть"
            title="Закрыть"
            className="focus-visible:outline-none"
          >
            <CloseIcon />
          </Button>
        </header>

        {/* Font size: an iOS-style size slider flanked by small/large "А", with a
            live sample below. */}
        <section className="flex flex-col gap-3">
          <span className="text-sm font-medium text-heading">Размер шрифта</span>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="shrink-0 text-sm text-text">
              А
            </span>
            <input
              type="range"
              min={FONT_SCALE_MIN}
              max={FONT_SCALE_MAX}
              step={FONT_SCALE_STEP}
              value={draft}
              onChange={handleSlider}
              aria-label="Размер шрифта"
              className="h-2 flex-1 cursor-pointer accent-primary"
            />
            <span aria-hidden="true" className="shrink-0 text-2xl text-text">
              А
            </span>
          </div>
          <p className="m-0 rounded-md border border-border bg-primary-bg px-3 py-2 text-text">
            {SAMPLE_TEXT}
          </p>
        </section>

        {error && (
          <p role="alert" className="m-0 text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
          <Button variant="secondary" onClick={handleClose} disabled={saving}>
            Отмена
          </Button>
        </div>

        <span aria-hidden="true" className="h-px w-full bg-border" />

        <Button variant="secondary" onClick={handleLogout} className="gap-1.5 self-start">
          <LogoutIcon />
          Выйти
        </Button>
      </div>
    </div>
  )
}

export default SettingsModal
