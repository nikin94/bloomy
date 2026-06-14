import { useMemo } from 'react'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import type { Order, OrderColumn } from '../../types/order'

interface DataTableProps {
  orders: Order[]
  columns: OrderColumn[]
  onRowClick: (order: Order) => void
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
// shared with the upcoming mobile card layout); TanStack owns only the rendering
// engine (row model + flexRender), so the library never leaks into the types.
function toColumnDef(column: OrderColumn): ColumnDef<Order> {
  return {
    id: column.id,
    header: column.header,
    cell: ({ row }) => renderCell(row.original, column),
  }
}

// Scroll container with a fixed height — the basis for future virtualization
// (the sticky header stays in place while rows scroll).
function DataTable({ orders, columns, onRowClick }: DataTableProps) {
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

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-[15px]">
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
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-text" colSpan={columnDefs.length}>
                Заказов пока нет
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer transition-colors hover:bg-accent-bg focus-visible:bg-accent-bg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                role="link"
                tabIndex={0}
                onClick={() => onRowClick(row.original)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onRowClick(row.original)
                  }
                }}
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
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default DataTable
