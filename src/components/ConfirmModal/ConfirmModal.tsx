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
  <Modal title={title} onClose={onCancel}>
    <p className="m-0 text-text">{body}</p>
    <div className="flex justify-end gap-2">
      <Button variant={confirmVariant} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
    </div>
  </Modal>
)

export default ConfirmModal
