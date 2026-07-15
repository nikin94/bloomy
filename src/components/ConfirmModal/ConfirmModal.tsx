import type { ReactNode } from 'react'
import Modal from '@/components/Modal/Modal'
import Button from '@/components/Button/Button'

// A confirmation dialog for a destructive action: a Modal with a body message and
// a [confirm, cancel] button pair. Extracted because the order-detail "delete
// order" and the customers-list "delete customer" dialogs rendered the identical
// block — same body <p>, same danger-confirm / secondary-cancel pair in the same
// order — differing only in the title, body text and handlers. The confirm button
// is `danger` by default (both current uses are deletes); pass `confirmVariant` to
// override. The caller owns mount gating (render this only while confirming) and
// supplies the title, body, the confirm/cancel labels and their handlers.
const ConfirmModal = ({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirmVariant = 'danger',
}: {
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  // Also wired to the Modal's onClose (backdrop / Esc), so dismissing the dialog
  // any way counts as "cancel".
  onCancel: () => void
  confirmVariant?: 'primary' | 'secondary' | 'danger'
}) => (
  // No header X: the cancel button below is already the explicit dismiss, so a
  // third close affordance would only crowd the small dialog (backdrop + Esc
  // still work). Title and body are centred; the button pair is set off from
  // the text by a top margin and stretches 50/50 across a phone width.
  <Modal title={title} onClose={onCancel} hideClose centerTitle>
    <p className="m-0 text-center text-text">{body}</p>
    <div className="mt-6 flex justify-end gap-2">
      <Button variant={confirmVariant} onClick={onConfirm} className="max-sm:flex-1">
        {confirmLabel}
      </Button>
      <Button variant="secondary" onClick={onCancel} className="max-sm:flex-1">
        {cancelLabel}
      </Button>
    </div>
  </Modal>
)

export default ConfirmModal
