import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import Spinner from '../../components/Spinner/Spinner'
import Button from '../../components/Button/Button'
import Modal from '../../components/Modal/Modal'
import SearchControl from '../../components/SearchControl/SearchControl'
import CustomerForm from '../../components/CustomerForm/CustomerForm'
import PencilIcon from '../../components/icons/PencilIcon'
import { fetchCustomers, softDeleteCustomer, updateCustomer } from '../../firebase/customers'
import type { CustomerEdits } from '../../firebase/customers'
import { useAuth } from '../../context/authContext'
import { useHeaderActions } from '../../context/headerActionsContext'
import { filterCustomers } from '../../types/customer'
import type { Customer } from '../../types/customer'
import { TABLE_CELL_BASE, TABLE_CELL_NOWRAP, TABLE_CELL_WRAP } from '../../styles/tableStyles'

const TrashIcon = () => (
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
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

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
    aria-label={t('openAria', { name: customer.name })}
    onClick={() => onOpen(customer)}
    onKeyDown={(e) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        onOpen(customer)
      }
    }}
    className="cursor-pointer transition-colors hover:bg-primary-bg focus-visible:bg-primary-bg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
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
      className="-m-1 min-w-0 flex-1 cursor-pointer rounded-md p-1 transition-colors hover:bg-primary-bg focus-visible:bg-primary-bg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
    >
      <p className="m-0 truncate font-semibold text-heading">{customer.name}</p>
      {customer.phone && <p className="m-0 truncate text-sm text-text">{customer.phone}</p>}
      {customer.address && <p className="m-0 truncate text-sm text-text">{customer.address}</p>}
      {customer.note && <p className="m-0 break-words text-sm text-text">{customer.note}</p>}
    </div>
    <RowActions customer={customer} t={t} onEdit={onEdit} onRequestDelete={onRequestDelete} />
  </div>
)

// Address-book screen: lists the signed-in user's active customers and lets each
// be edited (in a modal, one at a time) or removed (soft delete — see softDeleteCustomer).
// The list uses the same full-width table (desktop) / card stack (mobile) look as
// the orders and trash screens, so all list pages read consistently and fill the
// width the sidebar freed up.
const CustomersPage = () => {
  const { t } = useTranslation(['customer', 'common'])
  const navigate = useNavigate()
  // Guaranteed non-null under ProtectedRoute, but read defensively and gate on it.
  const { user } = useAuth()
  const ownerId = user?.uid
  const [customers, setCustomers] = useState<Customer[]>([])
  // The customer currently being edited, or null. Holding it on the page (not
  // per row) means only ONE edit dialog is ever open at a time.
  const [editing, setEditing] = useState<Customer | null>(null)
  // The customer pending a delete confirmation.
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  // A load failure means there is no list to show, so it replaces the content.
  const [loadError, setLoadError] = useState<string | null>(null)
  // Inline search over the address book (name / phone).
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!ownerId) return
    let active = true
    fetchCustomers(ownerId)
      .then((data) => {
        if (!active) return
        // Show the address book alphabetically — there is no natural order.
        setCustomers([...data].sort((a, b) => a.name.localeCompare(b.name, 'ru')))
      })
      .catch((err: unknown) => {
        if (active)
          setLoadError(err instanceof Error ? err.message : t('list.loadError'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // `t` is only read in the error fallback; depending on it would refetch on a
    // language switch, so it's intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId])

  // Persist an edit, then update the in-memory list. Optional fields that came
  // in empty are dropped (mirroring updateCustomer) so a cleared field also
  // clears in the UI; the list is re-sorted because the name may have changed.
  // updateCustomer is fire-and-forget (offline-safe), so this never blocks and
  // the dialog closes at once; a failed write is reported to Sentry.
  const handleSave = async (id: string, edits: CustomerEdits) => {
    updateCustomer(id, edits)
    const trimmed = (value: string | undefined) =>
      value && value.trim() !== '' ? value.trim() : undefined
    setCustomers((prev) =>
      prev
        .map((c) =>
          c.id === id
            ? {
                ...c,
                name: edits.name.trim(),
                phone: trimmed(edits.phone),
                address: trimmed(edits.address),
                note: trimmed(edits.note),
              }
            : c,
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    )
  }

  // Soft-delete the confirmed customer, drop it from the list and close the
  // dialog. The write is fire-and-forget (offline-safe), so it never blocks and
  // the removal is optimistic; a failed write is reported to Sentry.
  const handleDelete = () => {
    if (!deletingCustomer) return
    softDeleteCustomer(deletingCustomer.id)
    setCustomers((prev) => prev.filter((c) => c.id !== deletingCustomer.id))
    setDeletingCustomer(null)
  }

  // Filtering is in memory: the whole address book is loaded, the dataset is
  // small, and it keeps search instant with no extra reads.
  const visibleCustomers = filterCustomers(customers, query)
  const searchActive = query.trim() !== ''

  // Search lives in the global header; published via the action slot (memoised so
  // its identity only changes with the query — see useHeaderActions).
  const headerActions = useMemo(
    () => <SearchControl value={query} onChange={setQuery} label={t('list.search')} />,
    [query, t],
  )
  useHeaderActions(headerActions)

  const rowProps = {
    t,
    onOpen: (c: Customer) => navigate(`/customers/${c.id}`),
    onEdit: setEditing,
    onRequestDelete: setDeletingCustomer,
  }

  return (
    <>
      {loading && <Spinner />}
      {loadError && (
        <p role="alert" className="px-6 py-8 text-danger">
          {loadError}
        </p>
      )}

      {!loading && !loadError && (
        <div className="min-h-0 flex-1 overflow-auto">
          {visibleCustomers.length === 0 ? (
            <p className="px-4 py-8 text-center text-text">
              {searchActive ? t('common:nothingFound') : t('list.empty')}
            </p>
          ) : (
            <>
              {/* Desktop: a full-width table matching the orders/trash lists. */}
              <table
                data-testid="customers-table"
                className="hidden w-full border-collapse text-[0.8333rem] lg:table"
              >
                <thead>
                  <tr>
                    {(['name', 'phone', 'address', 'note'] as const).map((col) => (
                      <th
                        key={col}
                        className="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-bg px-4 py-3 text-left font-semibold text-heading"
                      >
                        {t(`columns.${col}` as const)}
                      </th>
                    ))}
                    {/* Actions column — header intentionally blank (icon buttons). */}
                    <th className="sticky top-0 z-10 w-px border-b border-border bg-bg px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visibleCustomers.map((customer) => (
                    <CustomerTableRow key={customer.id} customer={customer} {...rowProps} />
                  ))}
                </tbody>
              </table>

              {/* Mobile: one card per customer. */}
              <div data-testid="customers-cards" className="flex flex-col gap-3 p-4 lg:hidden">
                {visibleCustomers.map((customer) => (
                  <CustomerCard key={customer.id} customer={customer} {...rowProps} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Edit dialog — one customer at a time. Mounted only while editing, so
          the form seeds fresh from the chosen customer each time. */}
      {editing && (
        <Modal key={editing.id} title={t('editTitle')} onClose={() => setEditing(null)}>
          <CustomerForm
            initial={{
              name: editing.name,
              phone: editing.phone,
              address: editing.address,
              note: editing.note,
            }}
            onCancel={() => setEditing(null)}
            onSubmit={async (edits) => {
              // handleSave throws on failure, which CustomerForm catches and
              // shows inline — so the dialog stays open until the save succeeds.
              await handleSave(editing.id, edits)
              setEditing(null)
            }}
          />
        </Modal>
      )}

      {/* Delete confirmation — a dialog (matching the order page), so a
          destructive action takes an explicit second step. */}
      {deletingCustomer && (
        <Modal
          title={t('deleteTitle', { name: deletingCustomer.name })}
          onClose={() => setDeletingCustomer(null)}
        >
          <p className="m-0 text-text">{t('deleteBody')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="danger" onClick={handleDelete}>
              {t('common:delete')}
            </Button>
            <Button variant="secondary" onClick={() => setDeletingCustomer(null)}>
              {t('common:cancel')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

export default CustomersPage
