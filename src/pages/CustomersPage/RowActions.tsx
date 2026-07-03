import type { TFunction } from 'i18next'
import Button from '@/components/Button/Button'
import PencilIcon from '@/components/icons/PencilIcon'
import TrashIcon from '@/components/icons/TrashIcon'
import type { Customer } from '@/types/customer'

// The edit + delete controls for a customer, shared by the desktop row and the
// mobile card. Wrapped in a container that STOPS click propagation so pressing a
// button never also triggers the surrounding open-customer target — the buttons
// stay independent of the row/card link.
const RowActions = ({
  customer,
  t,
  onEdit,
  onRequestDelete,
}: {
  customer: Customer
  t: TFunction<['customer', 'common']>
  onEdit: (customer: Customer) => void
  onRequestDelete: (customer: Customer) => void
}) => (
  <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
    <Button
      variant="secondary"
      size="icon"
      onClick={() => onEdit(customer)}
      aria-label={t('editAria', { name: customer.name })}
      title={t('edit')}
    >
      <PencilIcon />
    </Button>
    <Button
      variant="secondary"
      size="icon"
      onClick={() => onRequestDelete(customer)}
      aria-label={t('deleteAria', { name: customer.name })}
      title={t('delete')}
    >
      <TrashIcon />
    </Button>
  </div>
)

export default RowActions
