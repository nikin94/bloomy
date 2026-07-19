import type { TFunction } from 'i18next'
import type { Customer } from '@/types/customer'
import { TABLE_CELL_BASE, TABLE_CELL_NOWRAP, TABLE_CELL_WRAP } from '@/styles/tableStyles'
import { FOCUS_RING_INSET } from '@/styles/fieldStyles'
import { cn } from '@/lib/cn'
import RowActions from './RowActions'

// One customer as a desktop table row, mirroring the orders table look. The whole
// row navigates to the customer page (a link, keyboard-activatable); the trailing
// actions cell holds edit/delete and stops click propagation so those buttons
// don't also open the row. The keyboard handler guards on `e.target === row` so a
// key press while a focused action button has focus doesn't double-fire the open.
const CustomerTableRow = ({
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
  <tr
    role="link"
    tabIndex={0}
    // Every cell here is customer PII (name/phone/address/note), so the whole
    // row is masked in Sentry replays; the aria-label bakes the name in too,
    // which maskAttributes covers (see observability/sentry.ts).
    data-sentry-mask
    aria-label={t('openAria', { name: customer.name })}
    onClick={() => onOpen(customer)}
    onKeyDown={(e) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        onOpen(customer)
      }
    }}
    className={cn(
      'cursor-pointer transition-colors hover:bg-primary-bg focus-visible:bg-primary-bg',
      FOCUS_RING_INSET,
    )}
  >
    {/* Name / address / note WRAP so a narrow desktop reflows instead of
        scrolling sideways; the short phone column stays one line. See tableStyles. */}
    <td className={`${TABLE_CELL_BASE} ${TABLE_CELL_WRAP} text-heading`}>{customer.name}</td>
    <td className={`${TABLE_CELL_BASE} ${TABLE_CELL_NOWRAP} text-text`}>{customer.phone ?? '—'}</td>
    <td className={`${TABLE_CELL_BASE} ${TABLE_CELL_WRAP} text-text`}>{customer.address ?? '—'}</td>
    <td className={`${TABLE_CELL_BASE} ${TABLE_CELL_WRAP} text-text`}>{customer.note ?? '—'}</td>
    <td className="w-px whitespace-nowrap border-b border-border px-4 py-2.5 text-right align-top">
      <RowActions customer={customer} t={t} onEdit={onEdit} onRequestDelete={onRequestDelete} />
    </td>
  </tr>
)

export default CustomerTableRow
