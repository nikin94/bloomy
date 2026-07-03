import { flexRender } from '@tanstack/react-table'
import type { Row } from '@tanstack/react-table'
import type { Order, OrderColumn } from '@/types/order'
import { TABLE_CELL_BASE, TABLE_CELL_NOWRAP, TABLE_CELL_WRAP } from '@/styles/tableStyles'
import { activationProps } from './rowHelpers'

// One order as a table row (desktop layout). Extracted from the map so the loop
// body is a real component with a stable render boundary.
const OrderTableRow = ({
  row,
  highlighted,
  columnById,
  onActivate,
}: {
  row: Row<Order>
  highlighted: boolean
  columnById: Map<string, OrderColumn>
  onActivate: (order: Order) => void
}) => (
  <tr
    className={`cursor-pointer transition-colors hover:bg-primary-bg focus-visible:bg-primary-bg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary${
      highlighted ? ' row-highlight' : ''
    }`}
    {...activationProps(row.original, onActivate)}
  >
    {row.getVisibleCells().map((cell) => {
      const column = columnById.get(cell.column.id)
      // Wrappable columns give up width (reflow) so the table fits a narrow
      // desktop; the rest stay one line and truncate. See tableStyles.
      const fit = column?.wrap ? TABLE_CELL_WRAP : TABLE_CELL_NOWRAP
      return (
        <td
          key={cell.id}
          className={`${TABLE_CELL_BASE} ${fit} text-text${column?.width ? ` ${column.width}` : ''}`}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      )
    })}
  </tr>
)

export default OrderTableRow
