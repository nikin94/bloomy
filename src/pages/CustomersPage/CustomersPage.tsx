import { useEffect, useState } from 'react'
import AppHeader from '../../components/AppHeader/AppHeader'
import Spinner from '../../components/Spinner/Spinner'
import Button from '../../components/Button/Button'
import CustomerForm from '../../components/CustomerForm/CustomerForm'
import { fetchCustomers, softDeleteCustomer, updateCustomer } from '../../firebase/customers'
import type { CustomerEdits } from '../../firebase/customers'
import { useAuth } from '../../context/authContext'
import type { Customer } from '../../types/customer'

// One customer row: name/phone with edit and delete actions. Editing swaps the
// row for an inline CustomerForm (no separate page); the trash button reveals an
// in-place confirm/cancel pair (no modal dependency). Confirming calls the
// parent's onDelete, which soft-deletes the record and drops the row.
// Extracted from the map so the loop body is its own component.
const CustomerRow = ({
  customer,
  onSave,
  onDelete,
}: {
  customer: Customer
  onSave: (id: string, edits: CustomerEdits) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) => {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (editing) {
    return (
      <li className="border-b border-border py-3">
        <CustomerForm
          initial={{
            name: customer.name,
            phone: customer.phone,
            address: customer.address,
            note: customer.note,
          }}
          onCancel={() => setEditing(false)}
          onSubmit={async (edits) => {
            await onSave(customer.id, edits)
            setEditing(false)
          }}
        />
      </li>
    )
  }

  // On success the parent removes this row from the list, unmounting us; on
  // failure (surfaced page-level) we reset so the user can retry or cancel.
  const confirm = async () => {
    setDeleting(true)
    try {
      await onDelete(customer.id)
    } catch {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <li className="flex items-center gap-3 border-b border-border py-3">
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-heading">{customer.name}</p>
        {customer.phone && <p className="m-0 truncate text-sm text-text">{customer.phone}</p>}
      </div>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-sm text-text sm:inline">Удалить клиента?</span>
          <Button variant="danger" size="sm" onClick={confirm} disabled={deleting}>
            {deleting ? 'Удаление…' : 'Удалить'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={deleting}
          >
            Отмена
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setEditing(true)}
            aria-label={`Редактировать клиента ${customer.name}`}
            title="Редактировать"
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
            onClick={() => setConfirming(true)}
            aria-label={`Удалить клиента ${customer.name}`}
            title="Удалить"
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
      )}
    </li>
  )
}

// Address-book screen: lists the signed-in user's active customers and lets each
// be edited (inline) or removed (soft delete — see softDeleteCustomer).
const CustomersPage = () => {
  // Guaranteed non-null under ProtectedRoute, but read defensively and gate on it.
  const { user } = useAuth()
  const ownerId = user?.uid
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  // Two separate errors: a load failure means there is no list to show, so it
  // replaces the content; a delete failure happens with the list already on
  // screen, so it surfaces above the list without unmounting it.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
          setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить клиентов')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [ownerId])

  // Persist an edit, then update the in-memory list. Optional fields that came
  // in empty are dropped (mirroring updateCustomer) so a cleared field also
  // clears in the UI; the list is re-sorted because the name may have changed.
  // Errors propagate to the inline CustomerForm, which keeps itself open.
  const handleSave = async (id: string, edits: CustomerEdits) => {
    await updateCustomer(id, edits)
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

  const handleDelete = async (id: string) => {
    setDeleteError(null)
    try {
      await softDeleteCustomer(id)
      setCustomers((prev) => prev.filter((c) => c.id !== id))
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Не удалось удалить клиента')
      // Re-throw so the row resets its confirm state instead of hanging.
      throw err
    }
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader />

      {loading && <Spinner />}
      {loadError && (
        <p role="alert" className="px-6 py-8 text-danger">
          {loadError}
        </p>
      )}

      {!loading && !loadError && (
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            <h1 className="m-0 text-[1.2222rem] font-semibold text-heading">Клиенты</h1>

            {deleteError && (
              <p role="alert" className="m-0 text-danger">
                {deleteError}
              </p>
            )}

            {customers.length === 0 ? (
              <p className="m-0 text-text">Клиентов пока нет</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {customers.map((customer) => (
                  <CustomerRow
                    key={customer.id}
                    customer={customer}
                    onSave={handleSave}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default CustomersPage
