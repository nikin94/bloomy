import type React from 'react'
import type { Order } from '@/types/order'
import type { OrderColumn } from '@/components/DataTable/orderColumns'

// Raw string value of a column for an order: the column's format function when
// present, otherwise the stringified raw field. Derived columns (no `field`)
// must provide `format`. Shared by the table (renderCell) and the mobile card so
// both read the same OrderColumn source of truth.
export const cellValue = (order: Order, column: OrderColumn): string =>
  column.format ? column.format(order) : column.field ? String(order[column.field]) : ''

// Status tint for a row/card, shared by both layouts: a delivered order sits on
// a slight green, a cancelled one on a slight red (see the `status-tint-*`
// utilities in index.css — they carry their own stepped-up hover/focus state).
// Returns undefined for an in-progress order, and the caller then falls back to
// the default primary-bg hover — the two must not be combined, or hovering a
// red row would mix the primary green underneath it.
export const statusTintClass = (order: Order): string | undefined =>
  order.status === 'delivered'
    ? 'status-tint-done'
    : order.status === 'cancelled'
      ? 'status-tint-cancelled'
      : undefined

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
