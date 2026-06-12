// A customer in the address book. Shared across many orders (one customer →
// many orders) and scoped to the app user who owns it via `ownerId`
// (multi-tenancy), so each signed-in user has an independent set of customers.
//
// The customer is the single source of truth for the name: an order references
// a customer by `customerId` only and never stores a name snapshot, so renaming
// a customer is reflected in every order that points to it.
export interface Customer {
  id: string
  ownerId: string // app user UID that owns this record; set from auth
  name: string // required — the only mandatory field
  phone?: string // delivery contact
  address?: string // default address, used to prefill an order's delivery address
  email?: string
  note?: string // free-text notes (preferences, etc.)
  createdAt: number // timestamp (ms)
}

// Shape for creating a customer; `id` is assigned by Firestore on write.
export type NewCustomer = Omit<Customer, 'id'>
