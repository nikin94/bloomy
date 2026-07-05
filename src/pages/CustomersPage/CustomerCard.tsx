import type { TFunction } from 'i18next'
import type { Customer } from '@/types/customer'
import { cn } from '@/lib/cn'
import { FOCUS_RING_INSET } from '@/styles/fieldStyles'
import RowActions from './RowActions'

// The same customer as a card (mobile layout). The name/details block is the
// link (a SIBLING of the action buttons, never nesting them) — keeping the open
// target and the edit/delete buttons independently operable.
const CustomerCard = ({
  customer,
  t,
  onOpen,
  onEdit,
  onRequestDelete,
}: {
  customer: Customer
  t: TFunction<['customer', 'common']>
  onOpen: (customer: Customer) => void
  onEdit: (customer: Customer) => void
  onRequestDelete: (customer: Customer) => void
}) => (
  <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
    <div
      role="link"
      tabIndex={0}
      aria-label={t('openAria', { name: customer.name })}
      onClick={() => onOpen(customer)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(customer)
        }
      }}
      className={cn(
        '-m-1 min-w-0 flex-1 cursor-pointer rounded-md p-1 transition-colors hover:bg-primary-bg focus-visible:bg-primary-bg',
        FOCUS_RING_INSET,
      )}
    >
      <p className="m-0 truncate font-semibold text-heading">{customer.name}</p>
      {customer.phone && <p className="m-0 truncate text-sm text-text">{customer.phone}</p>}
      {customer.address && <p className="m-0 truncate text-sm text-text">{customer.address}</p>}
      {customer.note && <p className="m-0 break-words text-sm text-text">{customer.note}</p>}
    </div>
    <RowActions customer={customer} t={t} onEdit={onEdit} onRequestDelete={onRequestDelete} />
  </div>
)

export default CustomerCard
