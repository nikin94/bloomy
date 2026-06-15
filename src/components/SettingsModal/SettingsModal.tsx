import { useEffect, useState } from 'react'
import { useAuth } from '../../context/authContext'
import { useSettings } from '../../context/settingsContext'
import { signOutUser } from '../../firebase/auth'
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP } from '../../types/settings'
import Button from '../Button/Button'

// Number of discrete positions on the slider (one notch each), so the iOS-style
// ticks below the track always match the actual snap points.
const SCALE_STEPS = Math.round((FONT_SCALE_MAX - FONT_SCALE_MIN) / FONT_SCALE_STEP) + 1

// Custom-styled range: the native `accent-color` thumb can't be resized, so we
// strip the appearance and draw our own. The thumb is enlarged (size-6) for an
// easy grab and ringed with the background so it reads as a knob riding over the
// step ticks; `-mt-2.5` re-centres the 24px thumb on the 4px track. Stays a real
// <input type="range">, so its slider role / keyboard control are unchanged.
const sliderClass =
  'relative h-6 w-full cursor-pointer appearance-none bg-transparent ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border ' +
  '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border ' +
  '[&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10 [&::-webkit-slider-thumb]:-mt-2.5 [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow ' +
  '[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-bg [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow'

// Human-readable description of the current scale for screen readers, so the
// slider announces "уменьшен"/"по умолчанию"/"увеличен" rather than a raw number.
const fontScaleLabel = (scale: number) => {
  if (scale < 1) return 'уменьшен'
  if (scale > 1) return 'увеличен'
  return 'по умолчанию'
}

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
  const { user } = useAuth()
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
          >
            <CloseIcon />
          </Button>
        </header>

        {/* Font size: an iOS-style size slider flanked by small/large "А". The
            whole app scales live with the slider, so the dialog itself previews
            the chosen size — no separate sample text needed. */}
        <section className="flex flex-col gap-3">
          <span className="text-sm font-medium text-heading">Размер шрифта</span>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="shrink-0 text-sm text-text">
              А
            </span>
            <div className="relative flex-1">
              {/* Step notches, iOS-style. Inset by the thumb radius (px-3) so the
                  ticks line up with the thumb's centre at each snap point; taller
                  than the track so their ends show past it. The thumb (z-10) sits
                  over the current notch. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-3 top-1/2 flex h-3 -translate-y-1/2 items-center justify-between"
              >
                {Array.from({ length: SCALE_STEPS }).map((_, i) => (
                  <span key={i} className="h-3 w-0.5 rounded-full bg-border" />
                ))}
              </div>
              <input
                type="range"
                min={FONT_SCALE_MIN}
                max={FONT_SCALE_MAX}
                step={FONT_SCALE_STEP}
                value={draft}
                onChange={handleSlider}
                aria-label="Размер шрифта"
                // Screen readers announce a human-readable label (e.g. "увеличен")
                // instead of the raw scale number (0.875, 1.25).
                aria-valuetext={fontScaleLabel(draft)}
                className={sliderClass}
              />
            </div>
            <span aria-hidden="true" className="shrink-0 text-2xl text-text">
              А
            </span>
          </div>
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

        {/* Account row: the signed-in user's name (moved out of the header) next
            to sign-out. */}
        <div className="flex items-center justify-between gap-3">
          {user && (
            <span className="min-w-0 truncate text-sm text-text">
              {user.displayName ?? user.email}
            </span>
          )}
          <Button variant="secondary" onClick={handleLogout} className="shrink-0 gap-1.5">
            <LogoutIcon />
            Выйти
          </Button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
