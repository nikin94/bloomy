import type { ReactNode } from 'react'

// A read-only label/value row: muted label on the left, heading-coloured value
// on the right, with a bottom hairline divider. Shared by the order detail page
// and the customer page, which each rendered their own identical copy before
// (the "Field" component the reviewer flagged for extraction).
//
// `action` is an optional slot pinned to the row's end — e.g. the "edit
// customer" button on the order page's customer row. `labelBasisClass` sets the
// label column width FROM `sm:` up (must carry the `sm:` prefix so it's a literal
// Tailwind can emit): the order page uses wide labels ("Способ доставки") so it
// keeps the 200px default; the customer page passes a narrower basis. The value
// carries `break-words` so a long unbroken string (e.g. an address) wraps
// instead of overflowing — a no-op for ordinary content.
//
// Layout is RESPONSIVE: on a phone the row STACKS (label on its own line, value —
// with any action — below) so a fixed 200px label can't squeeze the value down to
// one-character-per-line vertical text; from `sm:` up it's the original
// label-left / value-right row. The value is a <div> (not a <span>) so it can hold
// a block control — the order page's inline status <Select> renders through here.
const DetailRow = ({
  label,
  value,
  action,
  labelBasisClass = 'sm:basis-[200px]',
}: {
  label: string
  value: ReactNode
  action?: ReactNode
  labelBasisClass?: string
}) => (
  <div className="flex flex-col gap-1 border-b border-border py-2 sm:flex-row sm:items-center sm:gap-3">
    <span className={`text-text sm:shrink-0 ${labelBasisClass}`}>{label}</span>
    <div className="flex min-w-0 items-center gap-3 sm:flex-1">
      <div className="min-w-0 flex-1 break-words text-heading">{value}</div>
      {action}
    </div>
  </div>
)

export default DetailRow
