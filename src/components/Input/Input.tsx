import { useId } from 'react'
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react'
import { FIELD_BASE, FIELD_INVALID, FIELD_NORMAL } from '@/styles/fieldStyles'
import { sanitizeDecimalInput, sanitizeIntegerInput } from '@/utils/format'

// Floating label: resting (down) state is the bare base; the floated (up) state
// is applied ONLY through `peer-*` variants, so it always wins over the base in
// the cascade regardless of focus/placeholder-shown variant ordering. The label
// floats up when the field is focused OR holds a value (`:not(:placeholder-shown)`,
// which needs the input to carry a non-empty placeholder — we set `placeholder=" "`).
// `bg-bg px-1` punches a notch in the top border (works because the field and its
// container are both `bg-bg`). The motion is gated behind `motion-safe:` so a
// reduced-motion user gets an instant snap instead of a slide.
//
// Browser AUTOFILL is a separate trigger: WebKit/Blink paint the saved value
// without exposing it to JS or to `:placeholder-shown` until the user interacts,
// so the value-driven float never fires and the label overlaps the autofilled
// text (the login screen bug). The `:autofill` pseudo-class IS set in that state,
// so float on it too. Two selector spellings on purpose — the standard
// `:autofill` (peer-autofill) and the prefixed `:-webkit-autofill` — as separate
// rules, because an unsupported selector would invalidate a combined list.
const FLOATING_LABEL =
  // `rounded` + the thin border matter only once floated (the resting label has
  // no background): the floated pill straddles the top border and its half above
  // the field sits on the page background, where square borderless edges read as
  // a stray rectangle. The border rests TRANSPARENT (not width 0) so the box
  // never changes size mid-flight, and `transition-all` fades its colour in over
  // the same 150ms the label travels up — the outline appears as the pill lifts.
  'pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded border border-transparent px-1 text-base text-placeholder ' +
  'motion-safe:transition-all motion-safe:duration-150 ' +
  'peer-focus:top-0 peer-focus:text-xs peer-focus:bg-bg peer-focus:text-primary peer-focus:border-border ' +
  'peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-xs ' +
  'peer-[:not(:placeholder-shown)]:bg-bg peer-[:not(:placeholder-shown)]:text-text ' +
  'peer-[:not(:placeholder-shown)]:border-border ' +
  'peer-autofill:top-0 peer-autofill:text-xs peer-autofill:bg-bg peer-autofill:text-text ' +
  'peer-autofill:border-border ' +
  'peer-[:-webkit-autofill]:top-0 peer-[:-webkit-autofill]:text-xs ' +
  'peer-[:-webkit-autofill]:bg-bg peer-[:-webkit-autofill]:text-text peer-[:-webkit-autofill]:border-border ' +
  'peer-aria-[invalid=true]:text-danger'

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
  // Floating label text. When set, a real <label> is rendered (linked to the
  // input via `htmlFor`, so it doubles as the accessible name) and animates from
  // an in-field placeholder position up to straddle the top border on focus / when
  // the field holds a value. Replaces the placeholder-as-label pattern. When
  // omitted, the field renders exactly as before (the caller's `placeholder`
  // shows as usual).
  label?: string
  // Optional helper text shown below the field (e.g. a phone format or a
  // password-length rule), linked to the input via `aria-describedby` so screen
  // readers announce it. Only rendered in the floating-label path.
  hint?: string
}

// The app's standard text input. Wraps the shared field styling (border, focus
// ring, padding) so every input looks identical; pass `invalid` for the error
// state, `numeric` for number entry, `label` for a floating label, and
// `className` for per-usage width. All native input props pass through.
const Input = ({
  invalid = false,
  className = '',
  numeric,
  type,
  inputMode,
  onChange,
  suffix,
  label,
  hint,
  id,
  placeholder,
  ...props
}: InputProps) => {
  // A stable id is needed only to link a floating <label> to the input; generated
  // unconditionally (hooks can't be conditional) and used only in the label path.
  const reactId = useId()
  const inputId = id ?? reactId
  const hintId = `${reactId}-hint`

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

  // Floating label: wrap so the <label> can be absolutely positioned over the
  // field. The input MUST carry a non-empty placeholder (" ") so `:placeholder-
  // shown` flips off the moment it holds a value, which drives the float. The
  // caller's own `placeholder` is intentionally ignored here — the label is the
  // hint now. Supports a suffix (reserve `pr-10`) just like the bare path.
  if (label) {
    return (
      // Outer wrapper carries width/layout; the inner `relative` box holds the
      // field so an absolutely-positioned suffix stays centred on the INPUT, not
      // on the input+hint stack. With no hint this renders identically to before.
      <div className={`w-full min-w-0 ${className}`}>
        <div className="relative">
          <input
            id={inputId}
            aria-invalid={invalid}
            aria-describedby={hint ? hintId : undefined}
            placeholder=" "
            className={`peer ${FIELD_BASE} w-full py-2 pl-3 ${suffix ? 'pr-10' : 'pr-3'} ${borderClass}`}
            {...numericProps}
            {...props}
          />
          <label htmlFor={inputId} className={FLOATING_LABEL}>
            {label}
          </label>
          {suffix && (
            <span className="absolute inset-y-0 right-0 flex items-center pr-1.5">{suffix}</span>
          )}
        </div>
        {hint && (
          <p id={hintId} className="m-0 mt-1 px-1 text-xs text-text">
            {hint}
          </p>
        )}
      </div>
    )
  }

  // No suffix: the bare input carries the consumer className (width/layout) as
  // before — the common case, kept byte-identical so nothing else shifts.
  if (!suffix) {
    return (
      <input
        id={id}
        aria-invalid={invalid}
        placeholder={placeholder}
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
        id={id}
        aria-invalid={invalid}
        placeholder={placeholder}
        className={`${FIELD_BASE} w-full py-2 pl-3 pr-10 ${borderClass}`}
        {...numericProps}
        {...props}
      />
      <span className="absolute inset-y-0 right-0 flex items-center pr-1.5">{suffix}</span>
    </div>
  )
}

export default Input
