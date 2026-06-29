import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { ColumnDef, Row, SortingState } from '@tanstack/react-table'
import type { Order, OrderColumn } from '../../types/order'

interface DataTableProps {
  orders: Order[]
  columns: OrderColumn[]
  onRowClick: (order: Order) => void
  // Order id to briefly highlight (e.g. the one just created). The matching
  // row/card plays a one-shot fade animation; see `.row-highlight` in App.css.
  highlightOrderId?: string
  // Shown when there are no rows. The caller distinguishes "no orders yet" from
  // "nothing matched the active filter".
  emptyMessage?: string
}

// Raw string value of a column for an order: the column's format function when
// present, otherwise the stringified raw field. Derived columns (no `field`)
// must provide `format`. Shared by the table (renderCell) and the mobile card so
// both read the same OrderColumn source of truth.
const cellValue = (order: Order, column: OrderColumn): string =>
  column.format ? column.format(order) : column.field ? String(order[column.field]) : ''

// Cell value for the table. A formatted value may contain newlines (e.g. the
// stacked plant list); render each line on its own row so it reads as a column,
// not one long string.
const renderCell = (order: Order, column: OrderColumn): ReactNode => {
  const value = cellValue(order, column)
  if (!value.includes('\n')) return value
  return value.split('\n').map((line, i) => <div key={i}>{line}</div>)
}

// Adapt our declarative OrderColumn config to TanStack column definitions.
// OrderColumn stays the domain-level source of truth (unit-tested on its own and
// shared by both the table and the mobile card layout); TanStack owns only the
// rendering engine (row model + flexRender + sorting), so the library never
// leaks types. A column with a `sortValue` becomes sortable: that raw value is
// the accessor TanStack's default sort compares (the rendered cell stays our
// `format`); a column without one is explicitly non-sortable.
const toColumnDef = (column: OrderColumn): ColumnDef<Order> => ({
  id: column.id,
  header: column.header,
  cell: ({ row }) => renderCell(row.original, column),
  ...(column.sortValue
    ? { accessorFn: column.sortValue, enableSorting: true }
    : { enableSorting: false }),
})

// A filled triangle next to a sorted header: up for ascending, down for
// descending. Rendered only on the column currently sorted, so the chevron
// itself signals which column drives the order and in which direction.
const SortChevron = ({ direction }: { direction: false | 'asc' | 'desc' }) => {
  if (!direction) return null
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="size-3 shrink-0"
      fill="currentColor"
    >
      {direction === 'asc' ? <path d="M6 3 1 9h10z" /> : <path d="M6 9 1 3h10z" />}
    </svg>
  )
}

// Map TanStack's sort state to the `aria-sort` value assistive tech expects.
const ariaSort = (direction: false | 'asc' | 'desc') =>
  direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'

// Shared interaction for a clickable order (table row or mobile card): acts as a
// link, focusable and activatable with Enter/Space for keyboard users.
const activationProps = (order: Order, onActivate: (order: Order) => void) => ({
  role: 'link' as const,
  tabIndex: 0,
  onClick: () => onActivate(order),
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onActivate(order)
    }
  },
})

// One order as a table row (desktop layout). Extracted from the map so the loop
// body is a real component with a stable render boundary.
const OrderTableRow = ({
  row,
  highlighted,
  widthById,
  onActivate,
}: {
  row: Row<Order>
  highlighted: boolean
  widthById: Map<string, string | undefined>
  onActivate: (order: Order) => void
}) => (
  <tr
    className={`cursor-pointer transition-colors hover:bg-primary-bg focus-visible:bg-primary-bg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary${
      highlighted ? ' row-highlight' : ''
    }`}
    {...activationProps(row.original, onActivate)}
  >
    {row.getVisibleCells().map((cell) => {
      const width = widthById.get(cell.column.id)
      return (
        <td
          key={cell.id}
          className={`max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-border px-4 py-2.5 text-text${
            width ? ` ${width}` : ''
          }`}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      )
    })}
  </tr>
)

// A small "label above, value below" pair used by the mobile card for the
// customer, address and the paired payment/shipment statuses.
const CardField = ({
  label,
  value,
  className = '',
}: {
  label: string
  value: string
  className?: string
}) => (
  <div className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
    <span className="text-xs font-medium uppercase tracking-wide text-text">{label}</span>
    <span className="break-words text-sm text-heading">{value}</span>
  </div>
)

// The same order as a card (mobile layout). Unlike the desktop table — a flat
// "label → value" row per column — the card regroups the SAME column values into
// a richer phone layout: a number/date header, stacked customer + address, each
// plant in its own bordered block, the total on one line, and payment/shipment
// side by side. Every value still comes from the OrderColumn config (looked up by
// id), so customer-name resolution, the order's currency, status labels and plant
// formatting stay the single source of truth shared with the table.
const OrderCard = ({
  order,
  columnById,
  highlighted,
  onActivate,
}: {
  order: Order
  columnById: Map<string, OrderColumn>
  highlighted: boolean
  onActivate: (order: Order) => void
}) => {
  const value = (id: string) => {
    const column = columnById.get(id)
    return column ? cellValue(order, column) : ''
  }
  const label = (id: string) => columnById.get(id)?.header ?? ''
  // The date column packs date + time on two lines (for the table); collapse them
  // onto one line for the card's header.
  const dateText = value('dateCreated').split('\n').join(' · ')
  // The plants column is newline-joined "name ×qty" lines — one bordered block each.
  const plantLines = value('plants').split('\n').filter(Boolean)
  return (
    <div
      className={`flex cursor-pointer flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-primary-bg focus-visible:bg-primary-bg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary${
        highlighted ? ' row-highlight' : ''
      }`}
      {...activationProps(order, onActivate)}
    >
      {/* Header: order number on the left, creation date on the right. */}
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <span className="font-semibold text-heading">
          {label('number')} {value('number')}
        </span>
        <span className="shrink-0 text-sm text-text">{dateText}</span>
      </div>

      <CardField label={label('customer')} value={value('customer')} />
      <CardField label={label('address')} value={value('address')} />

      {/* Plants: each line its own bordered block, not one joined string. */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-text">
          {label('plants')}
        </span>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {plantLines.map((line, i) => (
            <li
              key={i}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-heading"
            >
              {line}
            </li>
          ))}
        </ul>
      </div>

      {/* Payment status on the left, shipment pushed to the right edge
          (right-aligned, label over value). */}
      <div className="flex items-start justify-between gap-4">
        <CardField label={label('paymentStatus')} value={value('paymentStatus')} />
        <CardField
          label={label('shipmentStatus')}
          value={value('shipmentStatus')}
          className="items-end text-right"
        />
      </div>

      {/* Total at the bottom: label and amount on one line. */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-text">{label('total')}</span>
        <span className="font-semibold text-heading tabular-nums">{value('total')}</span>
      </div>
    </div>
  )
}

// Renders the orders as a sticky-header table on wider screens (lg+) and as a
// stack of cards below that (the eight columns don't fit a tablet/phone width).
// Both layouts come from the same TanStack row model, so the data and formatting
// stay in sync.
const DataTable = ({
  orders,
  columns,
  onRowClick,
  highlightOrderId,
  emptyMessage,
}: DataTableProps) => {
  const { t } = useTranslation()
  // Memoize the column defs so the table instance keeps a stable reference
  // (TanStack recomputes its models when columns/data identity changes).
  const columnDefs = useMemo(() => columns.map(toColumnDef), [columns])

  // Per-column width hints, keyed by column id. Looked up here (rather than
  // threaded through TanStack's meta) so the width stays a plain DataTable
  // concern and OrderColumn doesn't depend on the library's typing.
  const widthById = useMemo(
    () => new Map(columns.map((c) => [c.id, c.width])),
    [columns],
  )

  // The full column config keyed by id, so the mobile card can pull each value
  // (customer name, total, statuses, …) from the same source of truth as the table.
  const columnById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns])

  // Sorting is local, ephemeral state: clicking a header sorts the in-memory
  // list, but we don't persist the choice (it resets when the page remounts).
  const [sorting, setSorting] = useState<SortingState>([])

  // React Compiler bails out of memoizing this component because useReactTable
  // returns fresh functions each render (react-hooks/incompatible-library). That
  // is safe here — TanStack manages its own memoization internally and the orders
  // list is small — so silence the advisory rather than fight it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: orders,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    // First click sorts descending for every column (overriding TanStack's
    // type-dependent default), so the first click always reveals the "top"
    // values — newest, priciest, latest — consistently across columns.
    sortDescFirst: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = table.getRowModel().rows

  if (rows.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <p className="px-4 py-8 text-center text-text">{emptyMessage ?? t('nothingFound')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* Desktop: full table. */}
      <table
        data-testid="orders-table"
        className="hidden w-full border-collapse text-[0.8333rem] lg:table"
      >
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                const label = flexRender(header.column.columnDef.header, header.getContext())
                return (
                  <th
                    key={header.id}
                    aria-sort={header.column.getCanSort() ? ariaSort(sorted) : undefined}
                    className={`sticky top-0 z-10 whitespace-nowrap border-b border-border bg-bg px-4 py-3 text-left font-semibold text-heading${
                      widthById.get(header.column.id) ? ` ${widthById.get(header.column.id)}` : ''
                    }`}
                  >
                    {header.column.getCanSort() ? (
                      // A real button so the sort toggles by keyboard (Enter/Space)
                      // too. The negative margins + w-full make the WHOLE cell the
                      // hit area (not just the label), and the chevron rides a
                      // fixed-size slot that's always present, so toggling the sort
                      // never changes the column's width.
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="-mx-4 -my-3 flex w-full items-center gap-1 px-4 py-3 text-left font-semibold text-heading transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                      >
                        {label}
                        <span aria-hidden="true" className="inline-flex size-3 shrink-0 items-center justify-center">
                          <SortChevron direction={sorted} />
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => (
            <OrderTableRow
              key={row.id}
              row={row}
              highlighted={row.original.id === highlightOrderId}
              widthById={widthById}
              onActivate={onRowClick}
            />
          ))}
        </tbody>
      </table>

      {/* Mobile: one card per order. */}
      <div data-testid="orders-cards" className="flex flex-col gap-3 p-4 lg:hidden">
        {rows.map((row) => (
          <OrderCard
            key={row.id}
            order={row.original}
            columnById={columnById}
            highlighted={row.original.id === highlightOrderId}
            onActivate={onRowClick}
          />
        ))}
      </div>
    </div>
  )
}

export default DataTable
