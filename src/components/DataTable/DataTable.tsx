import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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

// Cell value: use the column's format function when present, otherwise
// stringify the raw field. Derived columns (no `field`) must provide `format`.
// A formatted value may contain newlines (e.g. the stacked plant list); render
// each line on its own row so it reads as a column, not one long string.
const renderCell = (order: Order, column: OrderColumn): ReactNode => {
  const value = column.format ? column.format(order) : column.field ? String(order[column.field]) : ''
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

// The same order as a card (mobile layout): a vertical list of "label → value"
// pairs, the whole card clickable. Reuses the table's cells so the formatting
// stays identical to the desktop layout.
const OrderCard = ({
  row,
  highlighted,
  onActivate,
}: {
  row: Row<Order>
  highlighted: boolean
  onActivate: (order: Order) => void
}) => (
  <div
    className={`cursor-pointer rounded-lg border border-border p-4 transition-colors hover:bg-primary-bg focus-visible:bg-primary-bg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary${
      highlighted ? ' row-highlight' : ''
    }`}
    {...activationProps(row.original, onActivate)}
  >
    <dl className="m-0 flex flex-col gap-1.5 text-[0.8333rem]">
      {row.getVisibleCells().map((cell) => (
        <div key={cell.id} className="flex gap-3">
          <dt className="shrink-0 basis-28 text-text">
            {String(cell.column.columnDef.header)}
          </dt>
          <dd className="m-0 min-w-0 break-words text-heading">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </dd>
        </div>
      ))}
    </dl>
  </div>
)

// Renders the orders as a sticky-header table on wider screens (lg+) and as a
// stack of cards below that (the eight columns don't fit a tablet/phone width).
// Both layouts come from the same TanStack row model, so the data and formatting
// stay in sync.
const DataTable = ({
  orders,
  columns,
  onRowClick,
  highlightOrderId,
  emptyMessage = 'Заказов пока нет',
}: DataTableProps) => {
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
        <p className="px-4 py-8 text-center text-text">{emptyMessage}</p>
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
            row={row}
            highlighted={row.original.id === highlightOrderId}
            onActivate={onRowClick}
          />
        ))}
      </div>
    </div>
  )
}

export default DataTable
