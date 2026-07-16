import { formatDate, formatMoney, formatTime } from '@/utils/format'
import {
  formatOrderNumber,
  getTotalMinor,
  plantLineLabel,
  plantsByValueDesc,
} from '@/types/order'
import type { Order } from '@/types/order'
import { paymentStatusLabel, orderStatusLabel } from '@/lib/orderLabels'
import type { OrderT } from '@/lib/orderLabels'

// The table's column configuration — the view layer for the orders list, split
// out of types/order so the domain type module stays free of presentation
// concerns (Tailwind width classes, date/money formatting). The table renders
// ONLY the columns from buildOrderColumns, not every Order field; to show/hide a
// column, edit the array here — the Order type stays the full source of truth.
//
// Modeled as a discriminated union so a column MUST carry exactly one of `field`
// or `format`: a `{ id, header }` with neither (which would render an empty
// cell) is a compile error, and providing both is rejected too (the `never`
// guards). This is the type-level guard the PR #5 review asked for.
interface OrderColumnBase {
  // Stable identity for the React key and column id.
  id: string
  header: string
  // Comparable value the table sorts the column by when its header is clicked.
  // The DISPLAYED value is often derived/formatted (e.g. "13", "1 500,00 ₽", a
  // resolved customer name), so sorting can't use the rendered string — it uses
  // this raw key instead. Omit to make the column non-sortable (e.g. the
  // multi-line plants list has no single meaningful key to order by).
  sortValue?: (order: Order) => string | number
  // Optional width hint (a Tailwind width class, e.g. `w-16`) applied to the
  // column's header and cells in the desktop table, so a few columns can be
  // nudged wider/narrower than their content-driven default. Omit for auto width.
  width?: string
  // When true, this column's cells WRAP long text onto more lines instead of
  // staying on one line (and being capped + ellipsised). In the auto-layout
  // table this is what lets a narrow desktop fit without a horizontal scrollbar:
  // the wrappable columns (customer, address, the plant list) give up width and
  // reflow, while the short fixed columns (№, date, total, statuses) keep theirs.
  wrap?: boolean
}

// A column backed by a raw Order field (default String() rendering).
interface FieldOrderColumn extends OrderColumnBase {
  field: keyof Order
  format?: never
}

// A derived column whose value comes from a formatter (e.g. the total).
interface FormatOrderColumn extends OrderColumnBase {
  field?: never
  format: (order: Order) => string
}

export type OrderColumn = FieldOrderColumn | FormatOrderColumn

// The list's active sort, lifted OUT of the DataTable so a second control (the
// filter dialog, for phones with no column headers to click) can drive it too.
// `field` is a sortable column's id (one that carries a `sortValue`); `dir` is
// the direction. `null` means "no explicit sort" — the list keeps its natural
// (as-loaded) order. Kept a plain domain shape so neither the pages nor the
// filter dialog depend on TanStack's SortingState — the DataTable adapts between
// the two internally.
// The two sort directions, as a canonical array so the sort-direction <select>
// can narrow its DOM value against the same source `dir` is typed from (see asEnum).
export const SORT_DIRECTIONS = ['asc', 'desc'] as const
export type SortDirection = (typeof SORT_DIRECTIONS)[number]

export interface OrderSort {
  field: string
  dir: SortDirection
}

// The columns a list can be sorted by: those with a `sortValue` (a stacked
// multi-line column like "plants" has no single key, so it is non-sortable and
// excluded). Returns id + header so a picker can label each option. Shared by the
// filter dialog's "sort by" select so its options always match the real columns.
export const sortableColumns = (columns: OrderColumn[]): { id: string; header: string }[] =>
  columns.filter((c) => c.sortValue).map((c) => ({ id: c.id, header: c.header }))

// Columns shown in the list table. This is a factory rather than a constant
// because the customer name is NOT stored on the order — it is resolved live
// from the customers collection via `getCustomerName(customerId)`. The caller
// (OrdersPage) loads customers once and passes a lookup, so the table renders
// with two queries instead of N+1 reads. Unknown/deleted customers fall back to
// whatever the lookup returns (e.g. "—"), so a dangling customerId never crashes.
export function buildOrderColumns(
  getCustomerName: (customerId: string) => string,
  t: OrderT,
): OrderColumn[] {
  return [
    {
      id: 'number',
      header: t('columns.number'),
      format: (o) => formatOrderNumber(o.number),
      // Not-yet-numbered (offline) orders are the most recent, so sort them as
      // the highest number rather than 0 — they sit with the newest, not first.
      sortValue: (o) => o.number ?? Number.MAX_SAFE_INTEGER,
      width: 'w-20',
    },
    {
      id: 'dateCreated',
      // Date AND time of creation, on two lines (the date prominent, the time as
      // a muted second line below) — see DataTable's newline-splitting renderer.
      header: t('columns.dateCreated'),
      format: (o) => `${formatDate(o.dateCreated)}\n${formatTime(o.dateCreated)}`,
      // Sort by the raw timestamp, not the formatted strings.
      sortValue: (o) => o.dateCreated,
      width: 'w-32',
    },
    {
      id: 'customer',
      header: t('columns.customer'),
      format: (o) => getCustomerName(o.customerId),
      sortValue: (o) => getCustomerName(o.customerId),
      wrap: true,
    },
    {
      id: 'address',
      header: t('columns.address'),
      field: 'address',
      sortValue: (o) => o.address,
      wrap: true,
    },
    // One plant per line (joined by newlines, which the table/card renders as
    // stacked rows), most valuable line first; the quantity shows as ×N only
    // when above 1.
    {
      // A stacked, multi-line list — no single key to sort by, so it stays
      // non-sortable (no sortValue).
      id: 'plants',
      header: t('columns.plants'),
      format: (o) => plantsByValueDesc(o.plants).map(plantLineLabel).join('\n'),
      // Each plant line already renders on its own row; wrapping also lets a long
      // plant name reflow rather than push the column (and the table) wider.
      wrap: true,
    },
    {
      id: 'total',
      header: t('columns.total'),
      format: (o) => formatMoney(getTotalMinor(o), o.currency),
      // Sort by the numeric total (minor units), not the formatted money string.
      sortValue: (o) => getTotalMinor(o),
      width: 'w-32',
    },
    {
      id: 'paymentStatus',
      header: t('columns.paymentStatus'),
      format: (o) => paymentStatusLabel(t, o.paymentStatus),
      // Sort by the displayed label so the order matches what the user reads.
      sortValue: (o) => paymentStatusLabel(t, o.paymentStatus),
      width: 'w-28',
    },
    {
      id: 'status',
      header: t('columns.status'),
      format: (o) => orderStatusLabel(t, o.status),
      sortValue: (o) => orderStatusLabel(t, o.status),
      width: 'w-28',
    },
  ]
}
