import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react'
import { FIELD_BASE, FIELD_INVALID, FIELD_NORMAL } from '../../styles/fieldStyles'
import { sanitizeDecimalInput, sanitizeIntegerInput } from '../../utils/format'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  // Marks the field as failing validation: red border + focus ring, and the
  // matching `aria-invalid` for assistive tech. Defaults to a valid field.
  invalid?: boolean
  // Numeric entry mode. 'decimal' is for money (a ru-RU comma is allowed and the
  // fraction is capped at two digits/kopecks); 'integer' is for whole numbers
  // (e.g. a quantity). Both stay `type="text"` — that drops the browser's native
  // number spinner AND lets the comma separator through — and filter out anything
  // that isn't a valid number as the user types, while `inputMode` brings up the
  // matching mobile keypad. Use this instead of `type="number"`/`inputMode` so
  // every numeric field behaves identically in one place.
  numeric?: 'decimal' | 'integer'
  // Content pinned to the RIGHT edge inside the field — e.g. a show/hide-password
  // eye toggle. When set, the input is wrapped in a relative container and gets
  // extra right padding so its text never collides with the suffix. The suffix
  // sits above the input, so an interactive suffix (a button) stays clickable.
  suffix?: ReactNode
}

// The app's standard text input. Wraps the shared field styling (border, focus
// ring, padding) so every input looks identical; pass `invalid` for the error
// state, `numeric` for number entry, and `className` for per-usage width. All
// native input props pass through.
const Input = ({
  invalid = false,
  className = '',
  numeric,
  type,
  inputMode,
  onChange,
  suffix,
  ...props
}: InputProps) => {
  // When numeric, take over type/inputMode and sanitize each keystroke before it
  // reaches the consumer's onChange — so a number field can't hold a non-number
  // and the caller just stores the value. Otherwise pass the props through as-is.
  const numericProps = numeric
    ? {
        type: 'text',
        inputMode: numeric === 'integer' ? ('numeric' as const) : ('decimal' as const),
        onChange: (e: ChangeEvent<HTMLInputElement>) => {
          e.target.value =
            numeric === 'integer'
              ? sanitizeIntegerInput(e.target.value)
              : sanitizeDecimalInput(e.target.value)
          onChange?.(e)
        },
      }
    : { type, inputMode, onChange }

  const borderClass = invalid ? FIELD_INVALID : FIELD_NORMAL

  // No suffix: the bare input carries the consumer className (width/layout) as
  // before — the common case, kept byte-identical so nothing else shifts.
  if (!suffix) {
    return (
      <input
        aria-invalid={invalid}
        className={`${FIELD_BASE} px-3 py-2 ${borderClass} ${className}`}
        {...numericProps}
        {...props}
      />
    )
  }

  // With a suffix: wrap so it can be pinned to the right edge. The consumer
  // className (width/layout) moves to the wrapper; the input fills it and reserves
  // `pr-10` so its text clears the suffix. `inset-y-0` + `flex items-center`
  // vertically centres the suffix regardless of its height.
  return (
    <div className={`relative w-full min-w-0 ${className}`}>
      <input
        aria-invalid={invalid}
        className={`${FIELD_BASE} w-full py-2 pl-3 pr-10 ${borderClass}`}
        {...numericProps}
        {...props}
      />
      <span className="absolute inset-y-0 right-0 flex items-center pr-1.5">{suffix}</span>
    </div>
  )
}

export default Input
