import type React from 'react'
import type { Order, OrderColumn } from '../../types/order'

// Raw string value of a column for an order: the column's format function when
// present, otherwise the stringified raw field. Derived columns (no `field`)
// must provide `format`. Shared by the table (renderCell) and the mobile card so
// both read the same OrderColumn source of truth.
export const cellValue = (order: Order, column: OrderColumn): string =>
  column.format ? column.format(order) : column.field ? String(order[column.field]) : ''

// Shared interaction for a clickable order (table row or mobile card): acts as a
// link, focusable and activatable with Enter/Space for keyboard users.
export const activationProps = (order: Order, onActivate: (order: Order) => void) => ({
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
