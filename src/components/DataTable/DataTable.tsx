import type { Order, OrderColumn } from '../../types/order'

interface DataTableProps {
  orders: Order[]
  columns: OrderColumn[]
  onRowClick: (order: Order) => void
}

// Cell value: use the column's format function when present,
// otherwise stringify the raw field.
function renderCell(order: Order, column: OrderColumn): string {
  if (column.format) return column.format(order)
  return String(order[column.key])
}

// Scroll container with a fixed height — the basis for future virtualization
// (the sticky header stays in place while rows scroll).
function DataTable({ orders, columns, onRowClick }: DataTableProps) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-[15px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-bg px-4 py-3 text-left font-semibold text-heading"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-text" colSpan={columns.length}>
                Заказов пока нет
              </td>
            </tr>
          ) : (
            orders.map((order) => (
              <tr
                key={order.id}
                className="cursor-pointer transition-colors hover:bg-accent-bg focus-visible:bg-accent-bg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                role="link"
                tabIndex={0}
                onClick={() => onRowClick(order)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onRowClick(order)
                  }
                }}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-border px-4 py-2.5 text-text"
                  >
                    {renderCell(order, column)}
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
