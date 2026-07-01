import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import Spinner from '../../components/Spinner/Spinner'
import Button from '../../components/Button/Button'
import Modal from '../../components/Modal/Modal'
import SearchControl from '../../components/SearchControl/SearchControl'
import CustomerForm from '../../components/CustomerForm/CustomerForm'
import { fetchCustomers, softDeleteCustomer, updateCustomer } from '../../firebase/customers'
import type { CustomerEdits } from '../../firebase/customers'
import { useAuth } from '../../context/authContext'
import { useHeaderActions } from '../../context/headerActionsContext'
import { filterCustomers } from '../../types/customer'
import type { Customer } from '../../types/customer'

// One customer row: name/details with edit and delete actions. Both buttons ask
// the parent to open a dialog (edit / delete confirmation) so only one is ever
// open at a time and the confirmation matches the order page's modal pattern.
// Extracted from the map so the loop body is its own component.
const CustomerRow = ({
  customer,
  t,
  onOpen,
  onEdit,
  onRequestDelete,
}: {
  customer: Customer
  // Passed from the parent (single i18next subscription) so each customer row
  // doesn't open its own useTranslation.
  t: TFunction<['customer', 'common']>
  onOpen: (customer: Customer) => void
  onEdit: (customer: Customer) => void
  onRequestDelete: (customer: Customer) => void
}) => {
  return (
  <li className="flex items-center gap-3 border-b border-border py-3">
    {/* The name/details block navigates to the customer page (acts as a link,
        focusable and Enter/Space-activatable). The edit/delete icons are
        SIBLINGS, not nested inside this target, so they stay independently
        clickable without an interactive-inside-interactive nesting. */}
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
      className="min-w-0 flex-1 cursor-pointer rounded-md transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <p className="m-0 truncate text-heading">{customer.name}</p>
      {/* The rest of the customer's details. Phone/address are usually short
          (truncate to one line); the note can be long, so it wraps in full so
          all the saved information is visible at a glance. */}
      {customer.phone && <p className="m-0 truncate text-sm text-text">{customer.phone}</p>}
      {customer.address && <p className="m-0 truncate text-sm text-text">{customer.address}</p>}
      {customer.note && <p className="m-0 break-words text-sm text-text">{customer.note}</p>}
    </div>

    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="secondary"
        size="icon"
        onClick={() => onEdit(customer)}
        aria-label={t('editAria', { name: customer.name })}
        title={t('edit')}
      >
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
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </Button>
      <Button
        variant="secondary"
        size="icon"
        onClick={() => onRequestDelete(customer)}
        aria-label={t('deleteAria', { name: customer.name })}
        title={t('delete')}
      >
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
      </Button>
    </div>
  </li>
  )
}

// Address-book screen: lists the signed-in user's active customers and lets each
// be edited (in a modal, one at a time) or removed (soft delete — see softDeleteCustomer).
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

  return (
    <>
      {loading && <Spinner />}
      {loadError && (
        <p role="alert" className="px-6 py-8 text-danger">
          {loadError}
        </p>
      )}

      {!loading && !loadError && (
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {visibleCustomers.length === 0 ? (
              <p className="m-0 text-text">
                {searchActive ? t('common:nothingFound') : t('list.empty')}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {visibleCustomers.map((customer) => (
                  <CustomerRow
                    key={customer.id}
                    customer={customer}
                    t={t}
                    onOpen={(c) => navigate(`/customers/${c.id}`)}
                    onEdit={setEditing}
                    onRequestDelete={setDeletingCustomer}
                  />
                ))}
              </ul>
            )}
          </div>
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
