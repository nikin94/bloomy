import type { Order, OrderColumn } from '../../types/order'
import styles from './DataTable.module.css'

interface DataTableProps {
  orders: Order[]
  columns: OrderColumn[]
  onRowClick: (order: Order) => void
}

// Значение ячейки: если у колонки есть format — используем его,
// иначе приводим сырое поле к строке.
function renderCell(order: Order, column: OrderColumn): string {
  if (column.format) return column.format(order)
  return String(order[column.key])
}

function DataTable({ orders, columns, onRowClick }: DataTableProps) {
  return (
    <div className={styles.container}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={styles.headCell}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr>
              <td className={styles.empty} colSpan={columns.length}>
                Заказов пока нет
              </td>
            </tr>
          ) : (
            orders.map((order) => (
              <tr
                key={order.id}
                className={styles.row}
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
                  <td key={column.key} className={styles.cell}>
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
