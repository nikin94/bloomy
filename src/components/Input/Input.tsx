import type { InputHTMLAttributes } from 'react'
import { FIELD_BASE, FIELD_INVALID, FIELD_NORMAL } from '../field/fieldStyles'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  // Marks the field as failing validation: red border + focus ring, and the
  // matching `aria-invalid` for assistive tech. Defaults to a valid field.
  invalid?: boolean
}

// The app's standard text input. Wraps the shared field styling (border, focus
// ring, padding) so every input looks identical; pass `invalid` for the error
// state and `className` for per-usage width. All native input props pass through.
const Input = ({ invalid = false, className = '', ...props }: InputProps) => (
  <input
    aria-invalid={invalid}
    className={`${FIELD_BASE} px-3 py-2 ${invalid ? FIELD_INVALID : FIELD_NORMAL} ${className}`}
    {...props}
  />
)

export default Input
