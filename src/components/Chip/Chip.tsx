import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// A small read-only pill showing an enum value as a badge — the order page's
// source / payment-method / delivery-method chips. DISPLAY-ONLY by design:
// chips render EXISTING enum fields, they are not a tag model (owner decision —
// no free-form tags in the data, so values stay typed and filterable).
//
// `accent` fills the pill with the primary color for the one value that should
// pop (the marketplace source); the default is a quiet outlined pill matching
// the secondary buttons, so a row of chips reads as metadata, not a traffic
// light. Both pairs reuse token combinations already contrast-validated in
// each theme (primary buttons / secondary buttons).
//
// `srLabel` prepends an invisible field name ("Источник: ") for screen
// readers: the visual design drops the labels because the values are
// self-evident to a sighted user, but a bare "Авито Наличные Почта" sequence
// is not self-evident to a listener.
//
// `emoji` prepends a visible CATEGORY marker (💰 payment, 🚚 delivery — the
// gift line's 🎁 pattern), so a sighted user can tell which field a chip
// came from without the dropped text labels. Decorative (aria-hidden): the
// sr-only field name above already carries the category for listeners.
const Chip = ({
  accent = false,
  srLabel,
  emoji,
  children,
}: {
  accent?: boolean
  srLabel?: string
  emoji?: string
  children: ReactNode
}) => (
  <span
    className={cn(
      // rounded-md, not rounded-full: matches the action rail's buttons beside
      // the row, so the corner language stays consistent across the page.
      'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-0.5 text-sm',
      accent ? 'bg-primary font-medium text-white' : 'border border-border text-heading',
    )}
  >
    {srLabel && <span className="sr-only">{srLabel}: </span>}
    {emoji && <span aria-hidden="true">{emoji}</span>}
    {children}
  </span>
)

export default Chip
