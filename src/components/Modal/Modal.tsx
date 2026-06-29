import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../Button/Button'

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

interface ModalProps {
  // Heading shown in the dialog header and used as its accessible name.
  title: string
  // Called when the user dismisses the dialog — backdrop click, Escape, or the
  // close (X) button. The CALLER owns mounting: render the Modal only while open
  // (e.g. `open ? <Modal/> : null`) so the body mounts fresh each time and the
  // focus trap captures/restores focus correctly.
  onClose: () => void
  // Dialog body.
  children: ReactNode
  // Panel max-width utility, overridable per dialog (defaults to a form width).
  widthClassName?: string
}

// The app's shared modal shell: a centred panel over a dimming backdrop. Owns
// everything a dialog needs and a body shouldn't re-implement — the `dialog`
// role + `aria-modal` + `aria-labelledby`, dismissal (backdrop / Escape / close
// button), and a focus trap that moves focus in on open, cycles Tab/Shift+Tab
// inside, and restores focus to the opener on close. The body is just children.
const Modal = ({ title, onClose, children, widthClassName = 'max-w-md' }: ModalProps) => {
  const { t } = useTranslation()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Focus trap: move focus into the dialog on open, keep Tab/Shift+Tab cycling
  // inside it (aria-modal hides the rest from screen readers but doesn't stop
  // sighted keyboard users tabbing out), and restore focus to whatever opened
  // the dialog when it closes. Runs once on mount — the caller mounts on open.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const opener = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )

    focusables()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }

    panel.addEventListener('keydown', onKey)
    return () => {
      panel.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop: tap outside to dismiss. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />

      <div
        ref={panelRef}
        className={`relative z-10 flex w-full ${widthClassName} flex-col gap-6 rounded-lg border border-border bg-bg p-6 shadow-xl`}
      >
        <header className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 text-lg font-semibold text-heading">
            {title}
          </h2>
          <Button
            variant="secondary"
            size="icon"
            onClick={onClose}
            aria-label={t('close')}
            title={t('close')}
          >
            <CloseIcon />
          </Button>
        </header>
        {children}
      </div>
    </div>
  )
}

export default Modal
