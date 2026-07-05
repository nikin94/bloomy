import { useId } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { FOCUS_RING } from '@/styles/fieldStyles'

// A lightweight tooltip that appears INSTANTLY on hover or focus — unlike the
// native `title` attribute, which the browser delays ~1s before showing. The
// visibility is toggled purely with Tailwind's `group` utilities (no JS state and
// no opacity transition), so there is nothing to lag: the bubble is shown the
// moment the pointer enters. The trigger is made focusable and linked to the
// bubble via `aria-describedby` (the bubble carries `role="tooltip"`), so keyboard
// and screen-reader users get the same hint as on hover.
//
// `label` is the hint text; `children` is the visible trigger it describes. The
// bubble sits below the trigger (so it can't be clipped by the header above) and
// is `pointer-events-none` so it never intercepts a click on what's underneath.
const Tooltip = ({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) => {
  const id = useId()
  return (
    <span
      tabIndex={0}
      aria-describedby={id}
      className={cn('group relative inline-flex rounded-md', FOCUS_RING, className)}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-tooltip-bg px-2 py-1 text-xs text-heading opacity-0 shadow-md group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}

export default Tooltip
