import type { Order } from '@/types/order'
import type { OrderColumn } from '@/components/DataTable/orderColumns'
import { cellValue, activationProps, statusTintClass } from './rowHelpers'
import CardField from './CardField'
import { cn } from '@/lib/cn'
import { FOCUS_RING_INSET } from '@/styles/fieldStyles'

// The same order as a card (mobile layout). Unlike the desktop table — a flat
// "label → value" row per column — the card regroups the SAME column values into
// a richer phone layout: a number/date header, stacked customer + address, each
// plant in its own bordered block, the total on one line, and payment/order
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
      className={cn(
        'flex cursor-pointer flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors',
        // The status tint lays over bg-surface as a gradient (see index.css) and
        // carries its own hover; untinted cards keep the primary-bg hover.
        statusTintClass(order) ?? 'hover:bg-primary-bg focus-visible:bg-primary-bg',
        // Skip rendering/layout/paint of off-screen cards: the browser only lays a
        // card out once it nears the viewport, so a long list scrolls cheaply with
        // no JS virtualizer for the (tall, variable-height) mobile layout. The
        // intrinsic-size placeholder keeps the scrollbar honest before a card has
        // been measured. Ignored by jsdom, so tests are unaffected.
        '[content-visibility:auto] [contain-intrinsic-size:0_220px]',
        FOCUS_RING_INSET,
        highlighted && 'row-highlight',
      )}
      {...activationProps(order, onActivate)}
    >
      {/* Header: order number on the left, creation date on the right. */}
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
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

      {/* Payment status on the left, the order status pushed to the right edge
          (right-aligned, label over value). */}
      <div className="flex items-start justify-between gap-4">
        <CardField label={label('paymentStatus')} value={value('paymentStatus')} />
        <CardField
          label={label('status')}
          value={value('status')}
          className="items-end text-right"
        />
      </div>

      {/* Total at the bottom, set off by a divider: label and amount on one line. */}
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
        <span className="text-sm font-medium text-text">{label('total')}</span>
        <span className="font-semibold text-heading tabular-nums">{value('total')}</span>
      </div>
    </div>
  )
}

export default OrderCard
