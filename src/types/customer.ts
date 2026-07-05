import { z } from 'zod'

// A customer in the address book. Shared across many orders (one customer →
// many orders) and scoped to the app user who owns it via `ownerId`
// (multi-tenancy), so each signed-in user has an independent set of customers.
//
// The customer is the single source of truth for the name: an order references
// a customer by `customerId` only and never stores a name snapshot, so renaming
// a customer is reflected in every order that points to it.
//
// Defined as a Zod schema so the runtime validator (used when reading Firestore
// documents) and the TypeScript type share a single source of truth. The doc id
// is added on top as `Customer`, not stored in the body.
export const STORED_CUSTOMER_SCHEMA = z.object({
  ownerId: z.string().min(1), // app user UID that owns this record; set from auth
  name: z.string().min(1), // required — the only mandatory field
  phone: z.string().optional(), // delivery contact
  address: z.string().optional(), // default address, used to prefill an order's delivery address
  note: z.string().optional(), // free-text notes (preferences, etc.)
  createdAt: z.number(), // timestamp (ms)
  // Soft-delete flag. A "deleted" customer is hidden from the address book and
  // the order-form picker, but the document is kept so past orders still resolve
  // its name (orders reference customers by id and store no name snapshot).
  // Optional so documents written before this field stay valid.
  isDeleted: z.boolean().optional(),
})

export type Customer = z.infer<typeof STORED_CUSTOMER_SCHEMA> & { id: string }

// Shape for creating a customer; `id` is assigned by Firestore on write.
export type NewCustomer = Omit<Customer, 'id'>

// Filter the address book by a search query, matching ANY of the customer's
// fields — name, phone, address or note — case- and whitespace-insensitive. An
// empty query matches everything. In memory, like filterOrders — the list is
// small and already loaded, so the search stays instant with no extra reads.
// Each list page keeps its own predicate (orders search number/customer/plants;
// this is the customers one).
export const filterCustomers = (customers: Customer[], query: string): Customer[] => {
  const q = query.trim().toLowerCase()
  if (q === '') return customers
  return customers.filter((c) =>
    `${c.name} ${c.phone ?? ''} ${c.address ?? ''} ${c.note ?? ''}`.toLowerCase().includes(q),
  )
}

// Resolve an order's customerId to a display name from a loaded customer list —
// the shared basis for the orders/trash lists' `getCustomerName` (each wraps this
// in a useMemo keyed on the list, for a stable identity). Builds a name-by-id map
// once; an unknown id (e.g. a hard-deleted customer) falls back to an em dash.
export const buildCustomerNameResolver = (customers: Customer[]): ((id: string) => string) => {
  const nameById = new Map(customers.map((c) => [c.id, c.name]))
  return (id: string) => nameById.get(id) ?? '—'
}

// An optional customer field for the OPTIMISTIC UI mirror after an edit: a blank
// (whitespace-only) value becomes undefined so a cleared field also clears in the
// view. Shared by the customer-edit handlers on the customers/customer/order pages.
// (The firestore layer's own `optional` writes deleteField() instead — a different
// concern: clearing the STORED field vs the in-memory value.)
export const trimOptional = (value: string | undefined): string | undefined =>
  value && value.trim() !== '' ? value.trim() : undefined

// Apply a set of edited fields onto a base customer for the OPTIMISTIC UI mirror,
// producing the customer as it will look after the save: the name trimmed, and each
// optional field trimmed-or-cleared (see trimOptional). All the base's other fields
// (id, ownerId, createdAt, …) carry through untouched. Shared by the three edit
// handlers (customers list / customer page / order detail), which each fed the same
// { name: trim, phone/address/note: trimOptional } literal into their cache writer.
// The `edits` shape is structural (matches CustomerEdits) so this stays free of a
// firebase import — the mapper is a pure domain concern.
export const applyCustomerEdits = (
  base: Customer,
  edits: { name: string; phone?: string; address?: string; note?: string },
): Customer => ({
  ...base,
  name: edits.name.trim(),
  phone: trimOptional(edits.phone),
  address: trimOptional(edits.address),
  note: trimOptional(edits.note),
})
