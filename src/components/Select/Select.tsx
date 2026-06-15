import type { SelectHTMLAttributes } from 'react'
import { FIELD_BASE, FIELD_NORMAL } from '../field/fieldStyles'

// A native <select> styled to match the app's inputs (it shares FIELD_BASE /
// FIELD_NORMAL with Input/Textarea). We set `appearance-none` so the browser
// drops its OS-native control: that removes the macOS popup horizontal offset
// (the native menu aligns to the OS control, not our box) and lets us draw our
// own chevron. The chevron is an absolutely positioned, theme-aware (`text-text`)
// icon with `pointer-events-none`, and `pr-9` reserves room for it so option text
// never collides with the arrow (hence the custom padding instead of px-3).
// `min-w-0` is essential: a native <select> won't shrink below its widest
// <option> by default (its intrinsic min-width is the longest option), so a long
// option — e.g. the customer picker's "Имя (+телефон)" — would otherwise pin the
// whole form to that width and refuse to shrink on narrow screens. With `min-w-0`
// the control shrinks to its assigned width and clips the shown value (`truncate`).
const selectClass =
  `${FIELD_BASE} ${FIELD_NORMAL} w-full min-w-0 truncate appearance-none py-2 pl-3 pr-9`

function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full min-w-0">
      <select className={`${selectClass} ${className}`} {...props}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text"
      >
        <path d="m6 8 4 4 4-4" />
      </svg>
    </div>
  )
}

export default Select
