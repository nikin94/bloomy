import { useId } from 'react'
import { cn } from '@/lib/cn'

// A single-select chip group replacing a <Select> for a short enum field (the
// order form's delivery method / payment method — owner decision: every option
// visible at once, one tap to pick, less dropdown chrome). NOT a tag model: it
// edits the SAME typed enum field the select did — chips are presentation only.
//
// Semantics follow CustomerPicker's mode slider: native radios stay the source
// of truth (form semantics, arrow-key movement between options — they share one
// generated `name`) but are visually hidden inside styled pill labels, so the
// whole pill is the tap target. The <fieldset>/<legend> pair names the group
// for assistive tech, matching how the pickers' groups announce themselves.
//
// Pills reuse contrast-validated token pairs: the selected chip is the primary
// button's fill, the rest are the secondary button's outline; `border` is on
// BOTH states so selecting never shifts layout by the border width. rounded-md
// matches the app's buttons and the order page's display chips.
const ChipRadioGroup = <V extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: V
  // Canonical option order, value + localized label (the orderLabels helpers).
  options: { value: V; label: string }[]
  onChange: (next: V) => void
  className?: string
}) => {
  const name = useId()
  return (
    <fieldset className={cn('flex min-w-0 flex-col border-0 p-0', className)}>
      <legend className="mb-1.5 p-0 text-sm text-text">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              // `relative` is LOAD-BEARING: the radio below is hidden with
              // `sr-only` (position: absolute), so the label must be its
              // containing block. Without one the radio positions against the
              // DOCUMENT at its unscrolled static offset — deep in the form's
              // scroll body that lands ~1.5 viewports down, stretching the
              // page with phantom scroll space, and clicking a pill focuses
              // the radio and scroll-jumps the page to it. (CustomerPicker's
              // labels carry `relative` for the same reason.)
              'relative cursor-pointer whitespace-nowrap rounded-md border px-3 py-1.5 text-sm transition-colors',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
              option.value === value
                ? 'border-primary bg-primary font-medium text-white'
                : 'border-border text-heading hover:bg-primary-bg',
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default ChipRadioGroup
