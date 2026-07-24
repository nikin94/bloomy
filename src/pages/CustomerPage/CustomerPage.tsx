import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import DataTable from '@/components/DataTable/DataTable'
import Button from '@/components/Button/Button'
import CustomerEditModal from '@/components/CustomerEditModal/CustomerEditModal'
import DetailRow from '@/components/DetailRow/DetailRow'
import PencilIcon from '@/components/icons/PencilIcon'
import { updateCustomer } from '@/firebase/customers'
import type { CustomerEdits } from '@/firebase/customers'
import { useCustomerSuspense, useCustomerCache } from '@/queries/customers'
import { useOrdersSuspense } from '@/queries/orders'
import { useRequiredOwnerId } from '@/hooks/useOwnerId'
import { usePageHeaderTitle } from '@/hooks/usePageHeaderTitle'
import { formatDate, formatMoney } from '@/utils/format'
import {
  revenueByCurrencyMinor,
  topPlantsByQuantity,
  giftsByDateDesc,
  CURRENCIES,
} from '@/types/order'
import { buildOrderColumns } from '@/components/DataTable/orderColumns'
import { applyCustomerEdits } from '@/types/customer'
import { SCREEN_PADDING } from '@/styles/screenStyles'

// How many "frequent plants" to surface in the summary.
const TOP_PLANTS = 3

// The shared DetailRow with this page's narrower label column (its labels —
// "Phone" / "Total orders" — are shorter than the order page's). A thin
// local alias so the call sites below stay terse and don't repeat the basis.
const Field = ({ label, value }: { label: string; value: ReactNode }) => (
  <DetailRow label={label} value={value} labelBasisClass="sm:basis-[160px]" />
)

// Customer page: the address-book record plus everything derived from this
// customer's orders — order count, paid revenue (per currency), first/last order
// dates, frequent plants, and the order list itself (same DataTable as the main
// list). All stats are computed in memory from the loaded orders, so the page is
// offline-safe and needs no schema change. Reached by clicking a row on the
// Customers page, or the customer name on an order.
const CustomerPage = () => {
  const { t } = useTranslation(['customer', 'order', 'common'])
  // Order-bound t for the column helpers (typed TFunction<'order'>).
  const { t: tOrder } = useTranslation('order')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const ownerId = useRequiredOwnerId()
  // The orders AND the customer SUSPEND (to the route-level Spinner in AppLayout,
  // throwing a load failure to the route error boundary there) — so the lazy
  // chunk and both data reads hold ONE continuous spinner instead of the chunk
  // fallback handing off to a page-local Spinner that restarted the ring. The
  // customer resolves null for a deleted/unknown id — the "not found" branch, a
  // legitimate non-loading state. Defense-in-depth: a foreign customer is treated
  // as not found, mirroring fetchOrder's owner re-check.
  const customerQuery = useCustomerSuspense(id)
  const { data: allOrders } = useOrdersSuspense(ownerId)
  const customerCache = useCustomerCache()
  const customer =
    customerQuery.data && customerQuery.data.ownerId === ownerId ? customerQuery.data : null
  // Memoized so a fresh `.filter()` array each render doesn't make DataTable's
  // TanStack Table reconcile its row models on an unstable reference (the #133
  // lesson — matches how OrdersPage/DeletedOrdersPage already memoize their lists).
  const orders = useMemo(
    () => allOrders.filter((o) => o.customerId === id),
    [allOrders, id],
  )
  // Edit happens in the shared dialog (same as the Customers list), so the page
  // doesn't duplicate the customer form.
  const [editing, setEditing] = useState(false)

  // MOBILE top bar names this screen with the customer, like the order pages;
  // the in-content h1 hides on phones (max-md:hidden below). masked: the name
  // is PII — starred out in Sentry replays here too, matching the content h1's
  // own data-sentry-mask. Null (not found) keeps the bar quiet.
  usePageHeaderTitle(customer?.name ?? null, { masked: true })

  // Persist an edit, then optimistically mirror it onto the single-customer cache
  // (what this page reads) so the page updates live, and invalidate the LIST caches
  // (address book + orders-page name resolution) — not the single cache, which we
  // just wrote. Empty optional fields drop to undefined, matching updateCustomer.
  // Fire-and-forget (offline-safe), so the dialog closes at once; a failed write
  // goes to Sentry.
  const handleSave = async (edits: CustomerEdits) => {
    if (!customer) return
    updateCustomer(customer.id, edits)
    customerCache.setCustomer(customer.id, (prev) => applyCustomerEdits(prev ?? customer, edits))
    customerCache.invalidateLists()
    setEditing(false)
  }

  // The column config the orders list uses. Every row here is THIS customer, so
  // the resolver can return the loaded name directly (no per-id lookup needed).
  // Memoized on the same principle as `orders` — a fresh columns array each render
  // would make DataTable rebuild its column defs needlessly.
  const columns = useMemo(
    () => buildOrderColumns(() => customer?.name ?? '—', tOrder),
    [customer?.name, tOrder],
  )

  // Derived stats — recomputed each render from the loaded orders (cheap; the
  // list is small). Revenue is per-currency and paid-only; dates span the orders.
  const revenue = revenueByCurrencyMinor(orders)
  const revenueEntries = CURRENCIES.filter((c) => revenue.has(c)).map(
    (c) => [c, revenue.get(c) ?? 0] as const,
  )
  const topPlants = topPlantsByQuantity(orders, TOP_PLANTS)
  // Every gift ever sent to this customer, one row per giving (NOT deduped —
  // two orders gifting the same plant are two separate rows), newest first,
  // each with the date of the order it went with.
  const gifts = giftsByDateDesc(orders)
  const orderDates = orders.map((o) => o.dateCreated)
  const firstOrder = orderDates.length > 0 ? Math.min(...orderDates) : null
  const lastOrder = orderDates.length > 0 ? Math.max(...orderDates) : null

  return (
    <>
      <div className={`min-h-0 flex-1 overflow-auto ${SCREEN_PADDING}`}>
        {!customer && <p className="text-text">{t('page.notFound')}</p>}

        {customer && (
          <div className="flex flex-col gap-6">
            {/* Summary — kept in a readable, centred column. The orders table
                below breaks out of this width to span the full page. */}
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
              {/* items-start (not wrap) so a long name wraps within its column
                  while the edit control stays pinned to the top-right and never
                  drops to its own line. On a phone the control is a compact pencil
                  icon (shrink-0 → never wraps, always flush right even beside a
                  multi-line name); from sm up it's the full text button. */}
              {/* max-md:justify-end: on a phone the name lives in the top bar
                  (usePageHeaderTitle above) and the h1 hides, so the edit
                  control alone keeps its right-edge spot instead of drifting
                  left with justify-between's single child. */}
              <header className="flex items-start justify-between gap-3 max-md:justify-end">
                {/* data-sentry-mask: the name + contact fields below are the
                    customer's PII, kept starred out in Sentry replays while the
                    labels/stats stay readable (see observability/sentry.ts).
                    DESKTOP-only — the phone reads the name from the top bar. */}
                <h1
                  data-sentry-mask
                  className="m-0 min-w-0 break-words text-2xl font-semibold text-heading max-md:hidden"
                >
                  {customer.name}
                </h1>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setEditing(true)}
                  aria-label={t('page.edit')}
                  title={t('page.edit')}
                  className="shrink-0 sm:hidden"
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="shrink-0 max-sm:hidden"
                >
                  {t('page.edit')}
                </Button>
              </header>

              {/* Contact details — only the fields the customer actually has. */}
              {(customer.phone || customer.address || customer.note) && (
                <section className="flex flex-col">
                  {customer.phone && (
                    <Field
                      label={t('form.phone')}
                      value={<span data-sentry-mask>{customer.phone}</span>}
                    />
                  )}
                  {customer.address && (
                    <Field
                      label={t('form.address')}
                      value={<span data-sentry-mask>{customer.address}</span>}
                    />
                  )}
                  {customer.note && (
                    <Field
                      label={t('form.note')}
                      value={<span data-sentry-mask>{customer.note}</span>}
                    />
                  )}
                </section>
              )}

              {/* Order stats, derived from this customer's orders. */}
              <section className="flex flex-col">
                <Field label={t('page.totalOrders')} value={String(orders.length)} />
                <Field
                  label={t('page.revenue')}
                  value={
                    revenueEntries.length === 0 ? (
                      '—'
                    ) : (
                      <span className="flex flex-col">
                        {revenueEntries.map(([currency, minor]) => (
                          <span key={currency} className="tabular-nums">
                            {formatMoney(minor, currency)}
                          </span>
                        ))}
                      </span>
                    )
                  }
                />
                {firstOrder !== null && (
                  <Field label={t('page.firstOrder')} value={formatDate(firstOrder)} />
                )}
                {lastOrder !== null && (
                  <Field label={t('page.lastOrder')} value={formatDate(lastOrder)} />
                )}
              </section>

              {/* Frequent plants — the operator's "what does this customer usually
                  buy" cue. Omitted entirely when the customer has no orders. */}
              {topPlants.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="m-0 text-lg font-semibold text-heading">{t('page.topPlants')}</h2>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {topPlants.map((plant) => (
                      <li
                        key={plant.name}
                        className="flex justify-between gap-3 rounded-md border border-border px-3 py-1.5 text-sm"
                      >
                        <span className="min-w-0 break-words text-heading">{plant.name}</span>
                        <span className="shrink-0 tabular-nums text-text">×{plant.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Gifts already sent to this customer — every giving as its own
                  row with its date (newest first), so the operator sees what was
                  gifted and WHEN, and can pick something new. Omitted when none
                  were ever sent. */}
              {gifts.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="m-0 text-lg font-semibold text-heading">{t('page.gifts')}</h2>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {/* Key: orderId + position in the list — an order carries at
                        most one gift today, but the array-shaped schema allows
                        more, and duplicate names across orders are expected. */}
                    {gifts.map((gift, i) => (
                      <li
                        key={`${gift.orderId}-${i}`}
                        className="flex justify-between gap-3 rounded-md border border-border px-3 py-1.5 text-sm"
                      >
                        <span className="min-w-0 break-words text-heading">
                          <span aria-hidden="true">🎁 </span>
                          {gift.name}
                        </span>
                        {/* The giving date, right-aligned in the same slot the
                            plants list above uses for its ×N quantity. */}
                        <span className="shrink-0 tabular-nums text-text">
                          {formatDate(gift.dateCreated)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {/* The customer's orders, in the same table/card layout as the main
                list — full width (not constrained to the summary column) so the
                table fills the page instead of scrolling inside a narrow box.
                Clicking a row opens that order. */}
            <section className="flex min-w-0 flex-col gap-2">
              <h2 className="m-0 text-lg font-semibold text-heading">{t('page.orders')}</h2>
              <DataTable
                orders={orders}
                columns={columns}
                onRowClick={(order) => navigate(`/orders/${order.id}`)}
                emptyMessage={t('page.noOrders')}
              />
            </section>
          </div>
        )}
      </div>

      {/* Edit dialog — the shared CustomerEditModal, mounted only while editing so
          it seeds fresh from the current customer each time. */}
      {editing && customer && (
        <CustomerEditModal
          customer={customer}
          title={t('editTitle')}
          onClose={() => setEditing(false)}
          onSubmit={handleSave}
        />
      )}
    </>
  )
}

export default CustomerPage
