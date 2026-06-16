import { useState } from 'react'
import { useAuth } from '../../context/authContext'
import { useSettings } from '../../context/settingsContext'
import { signOutUser } from '../../firebase/auth'
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP } from '../../types/settings'
import Button from '../Button/Button'
import Modal from '../Modal/Modal'
import Slider from '../Slider/Slider'

// Number of discrete positions on the slider (one notch each), so the iOS-style
// ticks below the track always match the actual snap points.
const SCALE_STEPS = Math.round((FONT_SCALE_MAX - FONT_SCALE_MIN) / FONT_SCALE_STEP) + 1

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

// Mounts the dialog only while open, so each opening starts from the persisted
// size (draft is seeded from `fontScale` on mount) without a reset effect.
const SettingsModal = ({ open, onClose }: { open: boolean; onClose: () => void }) =>
  open ? <SettingsDialog onClose={onClose} /> : null

// Settings dialog body. For now it holds the per-user font size (an iOS-style
// size slider) and the sign-out action; the shared Modal owns the shell (dialog
// role, backdrop, Escape, focus trap, header). The slider updates the whole app
// immediately for preview, but the size is only persisted to Firebase on
// "Сохранить"; closing without saving reverts the preview to the saved size.
const SettingsDialog = ({ onClose }: { onClose: () => void }) => {
  const { user } = useAuth()
  const { fontScale, previewFontScale, saveFontScale } = useSettings()
  const [draft, setDraft] = useState(fontScale)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dismissing (backdrop / Escape / close button / "Отмена") drops the live
  // preview back to the persisted size, then closes.
  const handleClose = () => {
    previewFontScale(fontScale)
    onClose()
  }

  const handleSlider = (next: number) => {
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
    <Modal title="Настройки" onClose={handleClose}>
      {/* Font size: an iOS-style size slider flanked by small/large "А". The
          whole app scales live with the slider, so the dialog itself previews
          the chosen size — no separate sample text needed. */}
      <section className="flex flex-col gap-3">
        <span className="text-sm font-medium text-heading">Размер шрифта</span>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="shrink-0 text-sm text-text">
            А
          </span>
          <Slider
            className="flex-1"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            ticks={SCALE_STEPS}
            value={draft}
            onChange={handleSlider}
            ariaLabel="Размер шрифта"
            // Screen readers announce a human-readable label (e.g. "увеличен")
            // instead of the raw scale number (0.875, 1.25).
            ariaValueText={fontScaleLabel(draft)}
          />
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
    </Modal>
  )
}

export default SettingsModal
