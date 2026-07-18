import { useMemo, useState } from 'react'
import { useCustomer, useCustomers } from '@/queries/customers'
import type { Customer } from '@/types/customer'
import type { CustomerMode } from './CustomerPicker'

// What the one-shot resolve tells the form to fix up before it first paints:
// a dangling seeded customer id to drop, and/or the customer mode to land in.
export interface CustomerOptionsInit {
  // The seeded customer id references NO document at all (hard-deleted, e.g.
  // via the admin reset) — the form must clear the selection: the submit guard
  // only rejects an EMPTY id, so a stale id would sail through and save the
  // order against a non-existent customer FK (rendering "—" everywhere).
  clearDanglingSelection: boolean
  // The mode the form should start in, or null to keep its seeded one:
  // returning users with a non-empty address book land in "existing"; a
  // cleared dangling selection over an EMPTY book forces "new".
  mode: CustomerMode | null
}

// The order form's customer options, through the shared TanStack cache (this
// used to be the app's one read that bypassed it, re-fetching and re-parsing a
// list the Customers page already held). Three concerns:
//   • the active address book, from the same cache entry the Customers page
//     uses (useCustomers — non-suspending, the form gates its own paint);
//   • the SEEDED customer of an edit/repeat/draft when it is absent from the
//     active list (soft-deleted): fetched via the single-customer cache and
//     kept in the options (labelled "(deleted)") so the order stays linked to
//     it unless changed — while a truly-gone id is reported for clearing;
//   • the one-shot init the form applies before its first paint (`onReady` +
//     `ready`): the mode landing and dangling-id cleanup the old fetch effect
//     did inside its .then, preserved so the form never paints mid-flip.
export function useCustomerOptions({
  ownerId,
  seededId,
  hasDraft,
  onReady,
}: {
  ownerId: string | undefined
  // The customer id the form was seeded with (edit/repeat source or a restored
  // draft's selection), when any — it must resolve to an option or be cleared,
  // never silently saved.
  seededId: string | undefined
  // A restored draft carries the mode the user actually left the form in —
  // flipping to "existing" over it would hide a half-typed new-customer name.
  hasDraft: boolean
  onReady: (init: CustomerOptionsInit) => void
}): { customers: Customer[]; ready: boolean } {
  const listQuery = useCustomers(ownerId)
  const active = listQuery.data

  // The seeded customer needs its own read only when the active list resolved
  // WITHOUT it (it may be soft-deleted — fetchCustomer still returns those).
  const seededMissing =
    seededId !== undefined && active !== undefined && !active.some((c) => c.id === seededId)
  const seededQuery = useCustomer(seededMissing ? seededId : undefined)
  const seeded = seededMissing ? (seededQuery.data ?? null) : null

  const customers = useMemo(() => {
    // A failed list read is non-fatal (matches the old .catch): the picker just
    // stays empty and the user adds a new customer.
    if (!active) return []
    return seeded ? [...active, seeded] : active
  }, [active, seeded])

  // Loading until the list — and, when needed, the seeded customer — resolve,
  // so the form's first paint already has the full option set and the correct
  // mode. A seeded-read ERROR is treated the same as "no such customer" (it
  // stops loading with no data): the whole point of the resolve is dropping a
  // dangling FK, so a swallowed error must not leave the stale id in place.
  const loading = listQuery.isLoading || (seededMissing && seededQuery.isLoading)
  const seededGone = seededMissing && !loading && seeded === null

  // One-shot init, applied DURING render — the supported "adjust state while
  // rendering" pattern: both `setReady` and the reducer dispatches inside
  // `onReady` belong to the component currently rendering (OrderForm), and the
  // `ready` flip guards the block so it runs exactly once. React discards this
  // render and re-renders with the fixed state, so the fix-ups (mode landing,
  // dangling clear) and `ready` land in the SAME commit that first paints the
  // form — the mode slider can never visibly snap. (Not an effect: the lint
  // rightly flags a sync setState there, and an effect would also paint one
  // extra Spinner frame between resolve and fix-up.)
  const [ready, setReady] = useState(false)
  if (!loading && !ready) {
    onReady({
      clearDanglingSelection: seededGone,
      mode:
        seededGone && customers.length === 0
          ? 'new'
          : customers.length > 0 && !hasDraft
            ? 'existing'
            : null,
    })
    setReady(true)
  }

  return { customers, ready }
}
