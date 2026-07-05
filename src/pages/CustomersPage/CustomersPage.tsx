import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Spinner from '@/components/Spinner/Spinner'
import Button from '@/components/Button/Button'
import Modal from '@/components/Modal/Modal'
import SearchControl from '@/components/SearchControl/SearchControl'
import CustomerEditModal from '@/components/CustomerEditModal/CustomerEditModal'
import { softDeleteCustomer, updateCustomer } from '@/firebase/customers'
import type { CustomerEdits } from '@/firebase/customers'
import { useCustomers, useCustomerCache, EMPTY_CUSTOMERS } from '@/queries/customers'
import { useAuth } from '@/context/authContext'
import { useHeaderActions } from '@/context/headerActionsContext'
import { filterCustomers, applyCustomerEdits } from '@/types/customer'
import type { Customer } from '@/types/customer'
import CustomerTableRow from './CustomerTableRow'
import CustomerCard from './CustomerCard'

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
  // Active address book from the shared query cache. Sorted alphabetically (no
  // natural order) from the cached, stable query array — an optimistic rename
  // updates the cache and this re-sorts.
  const customersQuery = useCustomers(ownerId)
  const customerCache = useCustomerCache()
  const customers = useMemo(
    () =>
      [...(customersQuery.data ?? EMPTY_CUSTOMERS)].sort((a, b) =>
        a.name.localeCompare(b.name, 'ru'),
      ),
    [customersQuery.data],
  )
  const loading = customersQuery.isLoading
  const loadError = customersQuery.error
  // The customer currently being edited, or null. Holding it on the page (not
  // per row) means only ONE edit dialog is ever open at a time.
  const [editing, setEditing] = useState<Customer | null>(null)
  // The customer pending a delete confirmation.
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null)
  // Inline search over the address book (name / phone).
  const [query, setQuery] = useState('')

  // Persist an edit, then optimistically reflect it in the active-list cache and
  // invalidate the customer caches (so the WITH-deleted list the orders page reads
  // re-resolves the name too). Optional fields that came in empty are dropped,
  // mirroring updateCustomer. updateCustomer is fire-and-forget (offline-safe), so
  // this never blocks and the dialog closes at once; a failed write goes to Sentry.
  const handleSave = async (id: string, edits: CustomerEdits) => {
    updateCustomer(id, edits)
    customerCache.setActiveList(ownerId, (prev) =>
      (prev ?? []).map((c) => (c.id === id ? applyCustomerEdits(c, edits) : c)),
    )
    customerCache.invalidateDerived(ownerId)
  }

  // Soft-delete the confirmed customer, drop it from the active-list cache and
  // close the dialog. The write is fire-and-forget (offline-safe), so it never
  // blocks and the removal is optimistic; a failed write goes to Sentry.
  const handleDelete = () => {
    if (!deletingCustomer) return
    softDeleteCustomer(deletingCustomer.id)
    customerCache.setActiveList(ownerId, (prev) =>
      (prev ?? []).filter((c) => c.id !== deletingCustomer.id),
    )
    customerCache.invalidateDerived(ownerId)
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
          {loadError.message || t('list.loadError')}
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
        // `key` re-seeds the form when switching which customer is edited (the
        // dialog instance persists between picks). onSubmit throws on failure,
        // which CustomerForm catches and shows inline — so the dialog stays open
        // until the save succeeds.
        <CustomerEditModal
          key={editing.id}
          customer={editing}
          title={t('editTitle')}
          onClose={() => setEditing(null)}
          onSubmit={async (edits) => {
            await handleSave(editing.id, edits)
            setEditing(null)
          }}
        />
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
