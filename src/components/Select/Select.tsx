import { useId } from 'react'
import type { SelectHTMLAttributes } from 'react'
import { FIELD_BASE, FIELD_INVALID, FIELD_NORMAL } from '@/styles/fieldStyles'

// Floating label for a <select>. Unlike an input, a select ALWAYS shows a value
// (its selected option, or a placeholder option), so there is no "resting in the
// field" state to animate from — the label simply stays in the floated (notched,
// top-border) position, matching the floated look of a filled input. `bg-bg px-1`
// punches the notch in the border; the colour follows focus / the invalid state
// so it reads consistently with Input/Textarea. `rounded` because the label's
// pill sticks out ABOVE the field: over the page background (not just the
// border notch) square corners read as a stray rectangle — on the login/photo
// backdrop especially — so the chip's corners follow the field's rounding.
// The thin `border-border` is STATIC here (Input/Textarea fade it in during the
// float): this label never travels, so it simply matches their floated end state.
const FLOATING_LABEL =
  'pointer-events-none absolute left-2 top-0 z-10 -translate-y-1/2 rounded border border-border bg-bg px-1 text-xs text-text ' +
  'peer-focus:text-primary peer-aria-[invalid=true]:text-danger'

// A native <select> styled to match the app's inputs (it shares FIELD_BASE with
// Input/Textarea). We set `appearance-none` so the browser drops its OS-native
// control: that removes the macOS popup horizontal offset (the native menu aligns
// to the OS control, not our box) and lets us draw our own chevron. The chevron is
// an absolutely positioned, theme-aware (`text-text`) icon with `pointer-events-
// none`, and `pr-9` reserves room for it so option text never collides with the
// arrow (hence the custom padding instead of px-3).
// `min-w-0` is essential: a native <select> won't shrink below its widest
// <option> by default (its intrinsic min-width is the longest option), so a long
// option — e.g. the customer picker's "Name (+phone)" — would otherwise pin the
// whole form to that width and refuse to shrink on narrow screens. With `min-w-0`
// the control shrinks to its assigned width and clips the shown value (`truncate`).
const selectClass = `${FIELD_BASE} w-full min-w-0 truncate appearance-none py-2 pl-3 pr-9`

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  // Floating label text. When set, a real <label> is rendered (linked via
  // `htmlFor`, so it doubles as the accessible name) and sits notched on the top
  // border. When omitted, the select renders exactly as before (the caller labels
  // it some other way, e.g. an adjacent <span> in a settings row).
  label?: string
  // Marks the field as failing validation: red border + focus ring + the matching
  // `aria-invalid`. Defaults to a valid field.
  invalid?: boolean
}

function Select({ className = '', children, label, invalid = false, id, ...props }: SelectProps) {
  // A stable id links a floating <label> to the select; generated unconditionally
  // (hooks can't be conditional) and used only in the label path.
  const reactId = useId()
  const selectId = id ?? reactId
  const borderClass = invalid ? FIELD_INVALID : FIELD_NORMAL

  return (
    <div className="relative w-full min-w-0">
      <select
        id={label ? selectId : id}
        // Render the attribute only when actually invalid: `aria-invalid="false"`
        // in the DOM can make some screen readers announce "invalid: false". The
        // CSS hook `peer-aria-[invalid=true]` only matches the explicit-true case
        // anyway, so dropping the false attribute changes nothing visually.
        aria-invalid={invalid || undefined}
        // `peer` so the floating <label> can react to focus/invalid via peer-*.
        className={`${label ? 'peer ' : ''}${selectClass} ${borderClass} ${className}`}
        {...props}
      >
        {children}
      </select>
      {label && (
        <label htmlFor={selectId} className={FLOATING_LABEL}>
          {label}
        </label>
      )}
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
