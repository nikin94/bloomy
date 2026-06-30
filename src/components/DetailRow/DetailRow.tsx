import type { ReactNode } from 'react'

// A read-only label/value row: muted label on the left, heading-coloured value
// on the right, with a bottom hairline divider. Shared by the order detail page
// and the customer page, which each rendered their own identical copy before
// (the "Field" component the reviewer flagged for extraction).
//
// `action` is an optional slot pinned to the row's end — e.g. the "edit
// customer" button on the order page's customer row. `labelBasisClass` sets the
// label column width: the order page uses wide labels ("Способ доставки") so it
// keeps the 200px default; the customer page passes a narrower basis. The value
// carries `break-words` so a long unbroken string (e.g. an address) wraps
// instead of overflowing — a no-op for ordinary content.
const DetailRow = ({
  label,
  value,
  action,
  labelBasisClass = 'basis-[200px]',
}: {
  label: string
  value: ReactNode
  action?: ReactNode
  labelBasisClass?: string
}) => (
  <div className="flex items-center gap-3 border-b border-border py-2">
    <span className={`shrink-0 ${labelBasisClass} text-text`}>{label}</span>
    <span className="min-w-0 flex-1 break-words text-heading">{value}</span>
    {action}
  </div>
)

export default DetailRow
