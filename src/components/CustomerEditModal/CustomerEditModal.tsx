import Modal from '@/components/Modal/Modal'
import CustomerForm from '@/components/CustomerForm/CustomerForm'
import type { CustomerEdits } from '@/firebase/customers'

// The customer-edit dialog: a Modal wrapping the shared CustomerForm, seeded from
// the customer's current fields. Extracted because three screens (the customers
// list, the customer page, and an order's detail page) each rendered the identical
// Modal + CustomerForm block — same `initial` mapping, same onCancel == onClose
// wiring — differing only in the title and how the save is persisted. Those stay
// the caller's concern via `title`/`onClose`/`onSubmit`; the caller also owns the
// mount gating (render this only while editing) and, when one instance is reused
// across different customers, a `key={customer.id}` so the form re-seeds.
const CustomerEditModal = ({
  customer,
  title,
  onClose,
  onSubmit,
}: {
  // The customer being edited — only its editable fields are read (structurally a
  // CustomerEdits; a full Customer satisfies it).
  customer: { name: string; phone?: string; address?: string; note?: string }
  title: string
  onClose: () => void
  // Persist the edited fields. Throwing surfaces inline in the form and keeps the
  // dialog open (see CustomerForm), so a failed save can be retried.
  onSubmit: (edits: CustomerEdits) => Promise<void>
}) => (
  <Modal title={title} onClose={onClose}>
    <CustomerForm
      initial={{
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        note: customer.note,
      }}
      onCancel={onClose}
      onSubmit={onSubmit}
    />
  </Modal>
)

export default CustomerEditModal
