import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@/components/Button/Button'
import CloseIcon from '@/components/icons/CloseIcon'

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
  // Drop the header's X button — for dialogs whose body already carries an
  // explicit dismiss action (ConfirmModal's cancel button), where a third close
  // affordance is clutter. Backdrop and Escape still dismiss.
  hideClose?: boolean
  // Centre the title (ConfirmModal centres its whole content).
  centerTitle?: boolean
}

// The app's shared modal shell: a centred panel over a dimming backdrop. Owns
// everything a dialog needs and a body shouldn't re-implement — the `dialog`
// role + `aria-modal` + `aria-labelledby`, dismissal (backdrop / Escape / close
// button), and a focus trap that moves focus in on open, cycles Tab/Shift+Tab
// inside, and restores focus to the opener on close. The body is just children.
const Modal = ({
  title,
  onClose,
  children,
  widthClassName = 'max-w-md',
  hideClose = false,
  centerTitle = false,
}: ModalProps) => {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
    >
      {/* Backdrop: tap outside to dismiss. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />

      {/* Panel. Tighter inset on phones (p-4) than desktop (sm:p-6): on a narrow
          viewport the outer margin + panel padding + any inner cell padding
          compound and starve the content width, so the phone gets back ~16px.
          Capped to the viewport height (`max-h-full`, the outer p-2/p-4 leaving a
          margin) so a tall dialog — e.g. the order filter on a short phone — never
          overflows the screen; the header stays fixed and the body scrolls. */}
      <div
        ref={panelRef}
        className={`relative z-10 flex max-h-full w-full ${widthClassName} flex-col gap-6 rounded-lg border border-border bg-bg p-4 shadow-xl sm:p-6`}
      >
        <header
          className={`flex items-center gap-3 ${centerTitle ? 'justify-center' : 'justify-between'}`}
        >
          <h2
            id={titleId}
            className={`m-0 text-lg font-semibold text-heading ${centerTitle ? 'text-center' : ''}`}
          >
            {title}
          </h2>
          {!hideClose && (
            <Button
              variant="secondary"
              size="icon"
              onClick={onClose}
              aria-label={t('close')}
              title={t('close')}
            >
              <CloseIcon />
            </Button>
          )}
        </header>
        {/* The scrollable body: `min-h-0` lets it shrink below its content height
            inside the capped flex column so `overflow-y-auto` actually engages
            (without it a flex item won't scroll — it grows past the cap instead).
            The negative margin + padding keep a focus ring from being clipped at
            the scroll edge. */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{children}</div>
      </div>
    </div>
  )
}

export default Modal
