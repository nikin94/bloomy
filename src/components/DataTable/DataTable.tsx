import { useMemo } from 'react'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef, Row } from '@tanstack/react-table'
import type { Order, OrderColumn } from '../../types/order'

interface DataTableProps {
  orders: Order[]
  columns: OrderColumn[]
  onRowClick: (order: Order) => void
  // Order id to briefly highlight (e.g. the one just created). The matching
  // row/card plays a one-shot fade animation; see `.row-highlight` in App.css.
  highlightOrderId?: string
}

// Cell value: use the column's format function when present, otherwise
// stringify the raw field. Derived columns (no `field`) must provide `format`.
function renderCell(order: Order, column: OrderColumn): string {
  if (column.format) return column.format(order)
  if (column.field) return String(order[column.field])
  return ''
}

// Adapt our declarative OrderColumn config to TanStack column definitions.
// OrderColumn stays the domain-level source of truth (unit-tested on its own and
// shared by both the table and the mobile card layout); TanStack owns only the
// rendering engine (row model + flexRender), so the library never leaks types.
function toColumnDef(column: OrderColumn): ColumnDef<Order> {
  return {
    id: column.id,
    header: column.header,
    cell: ({ row }) => renderCell(row.original, column),
  }
}

// Shared interaction for a clickable order (table row or mobile card): acts as a
// link, focusable and activatable with Enter/Space for keyboard users.
function activationProps(order: Order, onActivate: (order: Order) => void) {
  return {
    role: 'link' as const,
    tabIndex: 0,
    onClick: () => onActivate(order),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate(order)
      }
    },
  }
}

// One order as a table row (desktop layout). Extracted from the map so the loop
// body is a real component with a stable render boundary.
function OrderTableRow({
  row,
  highlighted,
  onActivate,
}: {
  row: Row<Order>
  highlighted: boolean
  onActivate: (order: Order) => void
}) {
  return (
    <tr
      className={`cursor-pointer transition-colors hover:bg-accent-bg focus-visible:bg-accent-bg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent${
        highlighted ? ' row-highlight' : ''
      }`}
      {...activationProps(row.original, onActivate)}
    >
      {row.getVisibleCells().map((cell) => (
        <td
          key={cell.id}
          className="max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-border px-4 py-2.5 text-text"
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  )
}

// The same order as a card (mobile layout): a vertical list of "label → value"
// pairs, the whole card clickable. Reuses the table's cells so the formatting
// stays identical to the desktop layout.
function OrderCard({
  row,
  highlighted,
  onActivate,
}: {
  row: Row<Order>
  highlighted: boolean
  onActivate: (order: Order) => void
}) {
  return (
    <div
      className={`cursor-pointer rounded-lg border border-border p-4 transition-colors hover:bg-accent-bg focus-visible:bg-accent-bg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent${
        highlighted ? ' row-highlight' : ''
      }`}
      {...activationProps(row.original, onActivate)}
    >
      <dl className="m-0 flex flex-col gap-1.5 text-[15px]">
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
}

// Renders the orders as a sticky-header table on wider screens and as a stack of
// cards on narrow ones (the columns don't fit a phone width). Both layouts come
// from the same TanStack row model, so the data and formatting stay in sync.
function DataTable({ orders, columns, onRowClick, highlightOrderId }: DataTableProps) {
  // Memoize the column defs so the table instance keeps a stable reference
  // (TanStack recomputes its models when columns/data identity changes).
  const columnDefs = useMemo(() => columns.map(toColumnDef), [columns])

  // React Compiler bails out of memoizing this component because useReactTable
  // returns fresh functions each render (react-hooks/incompatible-library). That
  // is safe here — TanStack manages its own memoization internally and the orders
  // list is small — so silence the advisory rather than fight it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: orders,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
  })

  const rows = table.getRowModel().rows

  if (rows.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <p className="px-4 py-8 text-center text-text">Заказов пока нет</p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* Desktop: full table. */}
      <table
        data-testid="orders-table"
        className="hidden w-full border-collapse text-[15px] md:table"
      >
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-bg px-4 py-3 text-left font-semibold text-heading"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => (
            <OrderTableRow
              key={row.id}
              row={row}
              highlighted={row.original.id === highlightOrderId}
              onActivate={onRowClick}
            />
          ))}
        </tbody>
      </table>

      {/* Mobile: one card per order. */}
      <div data-testid="orders-cards" className="flex flex-col gap-3 p-4 md:hidden">
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
