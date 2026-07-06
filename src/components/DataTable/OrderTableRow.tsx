import { flexRender } from '@tanstack/react-table'
import type { Row } from '@tanstack/react-table'
import type { Order } from '@/types/order'
import type { OrderColumn } from '@/components/DataTable/orderColumns'
import { TABLE_CELL_BASE, TABLE_CELL_NOWRAP, TABLE_CELL_WRAP } from '@/styles/tableStyles'
import { FOCUS_RING_INSET } from '@/styles/fieldStyles'
import { cn } from '@/lib/cn'
import { activationProps } from './rowHelpers'

// One order as a table row (desktop layout). Extracted from the map so the loop
// body is a real component with a stable render boundary.
//
// `measureRef`/`index` are set only when the table is virtualized (see DataTable):
// the virtualizer measures each rendered row's real height through the ref and
// keys the measurement by `data-index`, so wrapping cells don't need a fixed
// height. Both are optional, so the non-virtualized render path (and every test)
// mounts the row unchanged.
const OrderTableRow = ({
  row,
  highlighted,
  columnById,
  onActivate,
  measureRef,
  index,
}: {
  row: Row<Order>
  highlighted: boolean
  columnById: Map<string, OrderColumn>
  onActivate: (order: Order) => void
  measureRef?: (el: HTMLTableRowElement | null) => void
  index?: number
}) => (
  <tr
    ref={measureRef}
    data-index={index}
    className={cn(
      'cursor-pointer transition-colors hover:bg-primary-bg focus-visible:bg-primary-bg',
      FOCUS_RING_INSET,
      highlighted && 'row-highlight',
    )}
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
          className={cn(TABLE_CELL_BASE, fit, 'text-text', column?.width)}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      )
    })}
  </tr>
)

export default OrderTableRow
